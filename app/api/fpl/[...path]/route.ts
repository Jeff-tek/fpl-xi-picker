import { NextRequest, NextResponse } from "next/server";

const UPSTREAM =
  process.env.FPL_API ?? "https://fantasy.premierleague.com/api";

// GET /api/fpl/<anything> -> proxy to FPL API (avoids browser CORS blocks).
export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const path = (params.path ?? []).join("/");
  const qs = req.nextUrl.search ?? "";
  const url = `${UPSTREAM}/${path}${qs}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; fpl-team-analysis/1.0)" },
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Upstream ${res.status} for ${path}` },
      { status: res.status },
    );
  }
  const data = await res.json();
  return NextResponse.json(data);
}
