// Pure selling-price helpers for the free official FPL API.
// Money in tenths (£7.5m => 75). Selling price = bought + half the profit,
// rounded down, never below current price. No Next.js deps.

export interface EntryTransfer {
  element_in: number;
  element_out: number;
  event: number;
}

export interface ElementHistoryEntry {
  round: number;
  value: number;
}

export const tenthsToM = (tenths: number): number => tenths / 10;

// Latest GW a player was bought in (element_in), default GW1.
export const purchaseGwFor = (
  transfers: Array<{ element_in: number; event: number }>,
  elementId: number,
): number =>
  transfers.reduce(
    (gw, t) => (t.element_in === elementId && t.event > gw ? t.event : gw),
    1,
  );

// Value (tenths) at purchase GW: exact round, else nearest earlier round,
// else first entry, else null.
export const boughtCostAt = (
  history: Array<{ round: number; value: number }>,
  purchaseGw: number,
): number | null => {
  const exact = history.find((h) => h.round === purchaseGw);
  if (exact !== undefined) return exact.value;
  const prev = history
    .filter((h) => h.round <= purchaseGw)
    .sort((a, b) => b.round - a.round)[0];
  if (prev !== undefined) return prev.value;
  return history[0]?.value ?? null;
};

// Integer tenths: bought + floor(half the profit) when price rose, else current.
export const sellingPrice = (
  boughtTenths: number,
  currentTenths: number,
): number =>
  currentTenths > boughtTenths
    ? boughtTenths + Math.floor((currentTenths - boughtTenths) / 2)
    : currentTenths;

export interface ResolveSellingPriceOpts {
  entryId: number;
  elementId: number;
  currentCost: number;
  fetchUpstream: (url: string, signal: AbortSignal) => Promise<{ text: string }>;
}

export interface ResolvedSellingPrice {
  bought: number;
  sell: number;
  current: number;
  purchaseGw: number;
  source: "history" | "fallback";
}

const FPL_BASE = "https://fantasy.premierleague.com/api";

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// On-demand true selling price: one transfers fetch + one element-summary
// fetch. Any failure or missing history falls back to current price.
export const resolveSellingPrice = async (
  opts: ResolveSellingPriceOpts,
): Promise<ResolvedSellingPrice> => {
  const fallback = (): ResolvedSellingPrice => ({
    bought: opts.currentCost,
    sell: opts.currentCost,
    current: opts.currentCost,
    purchaseGw: 1,
    source: "fallback",
  });
  try {
    const signal = new AbortController().signal;
    const transfersJson = parseJson(
      (
        await opts.fetchUpstream(
          `${FPL_BASE}/entry/${opts.entryId}/transfers/`,
          signal,
        )
      ).text,
    );
    const transfers = Array.isArray(transfersJson)
      ? (transfersJson as Array<{ element_in: number; event: number }>)
      : [];
    const purchaseGw = purchaseGwFor(transfers, opts.elementId);

    const summary = parseJson(
      (
        await opts.fetchUpstream(
          `${FPL_BASE}/element-summary/${opts.elementId}/`,
          signal,
        )
      ).text,
    ) as { history?: unknown } | null;
    const history = Array.isArray(summary?.history)
      ? (summary.history as Array<{ round: number; value: number }>)
      : [];
    const bought = boughtCostAt(history, purchaseGw);
    if (bought === null) return fallback();
    return {
      bought,
      sell: sellingPrice(bought, opts.currentCost),
      current: opts.currentCost,
      purchaseGw,
      source: "history",
    };
  } catch {
    return fallback();
  }
};