import { NextResponse } from "next/server";

const UPSTREAM = (
  process.env.FPL_API?.trim() || "https://fantasy.premierleague.com/api"
).replace(/\/+$/, "");
const TIMEOUT_MS = 9000;
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "application/json, */*",
  Referer: "https://fantasy.premierleague.com/",
  Origin: "https://fantasy.premierleague.com",
};

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ error: "Missing ?q=" }, { status: 400 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const urls = [
      `${UPSTREAM}/entries/?search=${encodeURIComponent(q)}`,
      `${UPSTREAM}/entry/name/${encodeURIComponent(q)}/`,
    ];
    for (const url of urls) {
      const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
      const text = await res.text();
      if (!res.ok) continue;
      try {
        const data = JSON.parse(text);
        const id =
          data?.id ??
          data?.entry?.id ??
          (Array.isArray(data?.results) ? data.results[0]?.id : undefined) ??
          (Array.isArray(data) ? data[0]?.id : undefined);
        if (typeof id === "number")
          return NextResponse.json(
            { id },
            { headers: { "Cache-Control": "public, s-maxage=300" } },
          );
      } catch {
        continue;
      }
    }
    return NextResponse.json(
      { error: `No entry found for "${q}". Use your numeric Entry ID.` },
      { status: 404 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
