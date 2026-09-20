import { NextRequest, NextResponse } from "next/server";
import {
  FPL_BASE as UPSTREAM,
  TIMEOUT_MS,
  cacheControlFor,
  fetchUpstream,
} from "@/lib/fpl-client";

// GET /api/fpl/<anything> -> proxy to FPL API (avoids browser CORS blocks).
export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const path = (params.path ?? []).join("/");
  const qs = req.nextUrl.search ?? "";
  const url = `${UPSTREAM}/${path}${qs}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const { text } = await fetchUpstream(url, ctrl.signal);
    try {
      JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: `Upstream non-JSON for ${path}: ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": cacheControlFor(path),
      },
    });
  } catch (e) {
    const status =
      e instanceof Error && typeof (e as unknown as { status?: unknown }).status === "number"
        ? (e as unknown as { status: number }).status
        : 502;
    const reason =
      e instanceof Error
        ? e.name === "AbortError"
          ? `timed out after ${TIMEOUT_MS}ms`
          : (e.cause instanceof Error ? `${e.message} (cause: ${e.cause.message})` : e.message)
        : String(e);
    return NextResponse.json(
      { error: `Upstream fetch failed for ${path}: ${reason}` },
      { status: status === 403 ? 403 : 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
