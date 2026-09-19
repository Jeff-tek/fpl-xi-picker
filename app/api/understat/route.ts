import { NextResponse } from "next/server";

const UPSTREAM = "https://understat.com/json/getPlayersData.json";
const TIMEOUT_MS = 9000;

export async function GET(req: Request) {
  const season = new URL(req.url).searchParams.get("season") ?? "2024";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${UPSTREAM}?season=${encodeURIComponent(season)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "application/json, */*",
        Referer: "https://understat.com/",
      },
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok)
      return NextResponse.json(
        { error: `Upstream ${res.status} for understat: ${text.slice(0, 200)}` },
        { status: res.status },
      );
    try {
      JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: `Upstream non-JSON for understat: ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=3600",
      },
    });
  } catch (e) {
    const reason =
      e instanceof Error
        ? e.name === "AbortError"
          ? `timed out after ${TIMEOUT_MS}ms`
          : e.message
        : String(e);
    return NextResponse.json(
      { error: `Upstream fetch failed for understat: ${reason}` },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
