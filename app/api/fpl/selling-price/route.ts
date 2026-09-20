import { NextRequest, NextResponse } from "next/server";
import {
  FPL_BASE,
  TIMEOUT_MS,
  fetchUpstream,
} from "@/lib/fpl-client";
import {
  boughtCostAt,
  purchaseGwFor,
  sellingPrice,
} from "@/lib/selling-price";

interface EntryTransfer {
  element_in: number;
  element_out: number;
  event: number;
}

interface HistoryEntry {
  round: number;
  value: number;
}

// GET /api/fpl/selling-price?entryId=123&elementId=321&currentCost=75
// currentCost is tenths (£7.5m => 75). If omitted, falls back to bootstrap lookup.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams;
  const entryId = Number(qs.get("entryId"));
  const elementId = Number(qs.get("elementId"));
  const currentCostParam = qs.get("currentCost");

  if (!Number.isFinite(entryId) || !Number.isFinite(elementId)) {
    return NextResponse.json(
      { error: "Missing or invalid ?entryId=&elementId=" },
      { status: 400 },
    );
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    // Resolve current cost if not supplied — one extra fetch, still within 9s.
    let currentCost: number | null =
      currentCostParam !== null ? Number(currentCostParam) : null;
    if (currentCost !== null && !Number.isFinite(currentCost)) {
      return NextResponse.json(
        { error: "?currentCost must be numeric tenths" },
        { status: 400 },
      );
    }
    if (currentCost === null) {
      const { text } = await fetchUpstream(
        `${FPL_BASE}/bootstrap-static/`,
        ctrl.signal,
      );
      const boot = JSON.parse(text) as {
        elements?: Array<{ id: number; now_cost: number }>;
      };
      const el = boot.elements?.find((e) => e.id === elementId);
      if (!el) {
        return NextResponse.json(
          { error: `Element ${elementId} not found in bootstrap` },
          { status: 404 },
        );
      }
      currentCost = el.now_cost;
    }

    // 1) Transfers → purchase GW (default GW1)
    let purchaseGw = 1;
    try {
      const { text } = await fetchUpstream(
        `${FPL_BASE}/entry/${entryId}/transfers/`,
        ctrl.signal,
      );
      const data = JSON.parse(text) as unknown;
      const transfers: EntryTransfer[] = Array.isArray(data)
        ? (data as EntryTransfer[])
        : [];
      purchaseGw = purchaseGwFor(transfers, elementId);
    } catch {
      purchaseGw = 1;
    }

    // 2) element-summary → history value at purchase GW → selling price
    try {
      const { text } = await fetchUpstream(
        `${FPL_BASE}/element-summary/${elementId}/`,
        ctrl.signal,
      );
      const summary = JSON.parse(text) as {
        history?: Array<{ round: number; value: number } | { event: number; value: number }>;
      };
      // Normalize: FPL history uses `round`, older planner used `event`. Accept both.
      const raw = summary.history ?? [];
      const history: HistoryEntry[] = raw.map((h) => ({
        round:
          typeof (h as { round?: unknown }).round === "number"
            ? (h as { round: number }).round
            : (h as { event: number }).event,
        value: (h as { value: number }).value,
      }));
      const bought = boughtCostAt(history, purchaseGw);
      if (bought !== null) {
        const sell = sellingPrice(bought, currentCost);
        return NextResponse.json(
          {
            elementId,
            entryId,
            purchaseGw,
            bought,
            current: currentCost,
            sell,
            boughtM: bought / 10,
            currentM: currentCost / 10,
            sellM: sell / 10,
            source: "history" as const,
          },
          { headers: { "Cache-Control": "public, s-maxage=300" } },
        );
      }
    } catch {
      // fall through to fallback
    }

    // Fallback: use current as bought/sell
    return NextResponse.json(
      {
        elementId,
        entryId,
        purchaseGw,
        bought: currentCost,
        current: currentCost,
        sell: currentCost,
        boughtM: currentCost / 10,
        currentM: currentCost / 10,
        sellM: currentCost / 10,
        source: "fallback" as const,
      },
      { headers: { "Cache-Control": "public, s-maxage=300" } },
    );
  } catch (e) {
    const reason =
      e instanceof Error
        ? e.name === "AbortError"
          ? `timed out after ${TIMEOUT_MS}ms`
          : e.message
        : String(e);
    const status =
      e instanceof Error && typeof (e as { status?: unknown }).status === "number"
        ? (e as { status: number }).status
        : 502;
    return NextResponse.json(
      { error: `Selling-price fetch failed: ${reason}` },
      { status: status === 403 ? 403 : 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
