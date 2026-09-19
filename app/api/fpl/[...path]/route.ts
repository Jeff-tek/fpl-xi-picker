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
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-GB,en;q=0.9",
        Referer: "https://fantasy.premierleague.com/",
        Origin: "https://fantasy.premierleague.com",
      },
      next: { revalidate: 300 },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Upstream fetch failed for ${path}: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: `Upstream ${res.status} for ${path}` },
      { status: res.status },
    );
  }
  const data = await res.json();
  return NextResponse.json(data);
}
