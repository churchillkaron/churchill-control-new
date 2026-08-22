export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoInvestorFilmLuxuryChaptersRuntimeV4 } from "@/lib/investor-film/AvantiqoInvestorFilmLuxuryChaptersRuntimeV4";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

async function handler(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "status";
    if (action === "status") return NextResponse.json(await AvantiqoInvestorFilmLuxuryChaptersRuntimeV4.status());
    if (action === "render") {
      const chapter = url.searchParams.get("chapter");
      return NextResponse.json(await AvantiqoInvestorFilmLuxuryChaptersRuntimeV4.render(chapter));
    }
    return NextResponse.json({ success: false, error: "ACTION_INVALID" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, contract: AvantiqoInvestorFilmLuxuryChaptersRuntimeV4.CONTRACT, error: error?.message || "DYNAMIC_LUXURY_V4_FAILED" }, { status: 500 });
  }
}

export async function GET(request) { return handler(request); }
export async function POST(request) { return handler(request); }
