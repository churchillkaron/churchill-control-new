export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoInvestorFilmSpatialIntelligenceRuntimeV3 } from "@/lib/investor-film/AvantiqoInvestorFilmSpatialIntelligenceRuntimeV3";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

async function render(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    return NextResponse.json(await AvantiqoInvestorFilmSpatialIntelligenceRuntimeV3.render());
  } catch (error) {
    return NextResponse.json({ success: false, contract: AvantiqoInvestorFilmSpatialIntelligenceRuntimeV3.CONTRACT, error: error?.message || "V9_SPATIAL_INTELLIGENCE_V3_FAILED" }, { status: 500 });
  }
}

export async function GET(request) {
  return render(request);
}

export async function POST(request) {
  return render(request);
}
