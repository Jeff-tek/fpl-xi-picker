import { NextRequest, NextResponse } from "next/server";

const UPSTREAM = (
  process.env.FPL_API?.trim() || "https://fantasy.premierleague.com/api"
).replace(/\/+$/, "");

// Vercel Hobby kills functions at ~10s, so abort just under that to
// return a JSON diagnosis instead of a bare gateway error.
const TIMEOUT_MS = 9000;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-GB,en;q=0.9",
  Referer: "https://fantasy.premierleague.com/",
  Origin: "https://fantasy.premierleague.com",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
  "X-Requested-With": "XMLHttpRequest",
};

const RETRYABLE = new Set([403, 429, 502, 503]);
const MAX_ATTEMPTS = 3;

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

const mirrorBase = (): string | null => {
  const m = process.env.FPL_MIRROR?.trim().replace(/\/+$/, "");
  return m ? m : null;
};

const fetchUpstream = async (
  url: string,
  signal: AbortSignal,
): Promise<{ res: Response; text: string; url: string }> => {
  const bases = [url];
  const mirror = mirrorBase();
  if (mirror) {
    const u = new URL(url);
    bases.push(`${mirror}${u.pathname}${u.search}`);
  }
  let last = { status: 0, text: "", url };
  for (const base of bases) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const res = await fetch(base, {
        headers: BROWSER_HEADERS,
        signal,
        redirect: "follow",
        cache: "no-store",
      });
      const text = await res.text();
      if (res.ok) return { res, text, url: base };
      last = { status: res.status, text, url: base };
      if (!RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) break;
      await sleep(attempt === 1 ? 600 : 1500);
    }
  }
  const preview = last.text.slice(0, 200) || "(empty body — IP-based WAF block)";
  const hint =
    last.status === 403
      ? " FPL is rate-/IP-blocking this host (known on Vercel/AWS/Render shared egress). Wait a minute and retry; set FPL_MIRROR to a personal forwarder if it persists."
      : "";
  const err = new Error(
    `Upstream ${last.status} for ${last.url}.${hint} Preview: ${preview}`,
  );
  (err as { status?: number }).status = last.status;
  throw err;
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
    const { text, url: finalUrl } = await fetchUpstream(url, ctrl.signal);
    try {
      JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: `Upstream non-JSON for ${path}: ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const cacheFor = path.startsWith("bootstrap-static")
      ? "public, s-maxage=3600"
      : "public, s-maxage=300";
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": cacheFor,
      },
    });
  } catch (e) {
    const status =
      e instanceof Error && typeof (e as { status?: unknown }).status === "number"
        ? ((e as { status: number }).status as number)
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
