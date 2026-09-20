// Resilient FPL API client — pure functions, no Next.js deps.
// Used by the API route proxy to survive Vercel/AWS/Render shared-egress
// WAF/rate blocking from fantasy.premierleague.com.

export const FPL_BASE = (
  process.env.FPL_API?.trim() || "https://fantasy.premierleague.com/api"
).replace(/\/+$/, "");

// Vercel Hobby kills functions at ~10s, so abort just under that to
// return a JSON diagnosis instead of a bare gateway error.
export const TIMEOUT_MS = 9000;

// Full browser-like header set so the FPL edge treats us as a same-origin
// XHR client instead of an anonymous bot.
export const BROWSER_HEADERS = {
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

export const RETRYABLE = new Set([403, 429, 502, 503]);
export const MAX_ATTEMPTS = 3;

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Optional personal forwarder (own host) that relays to FPL from a clean IP. */
export const mirrorBase = (): string | null => {
  const m = process.env.FPL_MIRROR?.trim().replace(/\/+$/, "");
  return m ? m : null;
};

export interface UpstreamResult {
  res: Response;
  text: string;
  url: string;
}

export class FetchUpstreamError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, message: string) {
    super(message);
    this.name = "FetchUpstreamError";
    this.status = status;
    this.url = url;
  }
}

// Fetch `url` (a full FPL URL). Tries the primary first, then the FPL_MIRROR
// fallback; each base is retried on RETRYABLE statuses with 600ms then 1500ms
// backoff. Returns the first ok body, otherwise throws with the failing
// status, an actionable 403 hint, and a response preview.
export const fetchUpstream = async (
  url: string,
  signal: AbortSignal,
): Promise<UpstreamResult> => {
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
  const preview =
    last.text.slice(0, 200) || "(empty body — IP-based WAF block)";
  const hint =
    last.status === 403
      ? " FPL is rate-/IP-blocking this host (known on Vercel/AWS/Render shared egress). Wait a minute and retry; set FPL_MIRROR to a personal forwarder if it persists."
      : "";
  throw new FetchUpstreamError(
    last.status,
    last.url,
    `Upstream ${last.status} for ${last.url}.${hint} Preview: ${preview}`,
  );
};

/**
 * CDN cache policy per upstream path. bootstrap-static is ~1MB and changes
 * only per gameweek, so cache for an hour; everything else refreshes every
 * 5 minutes.
 */
export const cacheControlFor = (path: string): string =>
  path.startsWith("bootstrap-static")
    ? "public, s-maxage=3600"
    : "public, s-maxage=300";
