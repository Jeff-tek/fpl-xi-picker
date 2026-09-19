import { NextRequest, NextResponse } from "next/server";

const UPSTREAM =
  process.env.FPL_API ?? "https://fantasy.premierleague.com/api";

// Vercel Hobby kills functions at ~10s, so abort just under that to
// return a JSON diagnosis instead of a bare gateway error.
const TIMEOUT_MS = 9000;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-GB,en;q=0.9",
  Referer: "https://fantasy.premierleague.com/",
  Origin: "https://fantasy.premierleague.com",
};

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
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: ctrl.signal,
      redirect: "follow",
    });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream ${res.status} for ${path}: ${text.slice(0, 200)}` },
        { status: res.status },
      );
    }
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
        "Cache-Control": "public, s-maxage=300",
      },
    });
  } catch (e) {
    const reason =
      e instanceof Error
        ? e.name === "AbortError"
          ? `timed out after ${TIMEOUT_MS}ms`
          : (e.cause instanceof Error ? `${e.message} (cause: ${e.cause.message})` : e.message)
        : String(e);
    return NextResponse.json(
      { error: `Upstream fetch failed for ${path}: ${reason}` },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
