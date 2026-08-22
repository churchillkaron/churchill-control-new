export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoSyntheticIntelligenceReviewRuntimeV6 } from "@/lib/investor-film/AvantiqoSyntheticIntelligenceReviewRuntimeV6";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

export async function GET(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success:false, error:"UNAUTHORIZED" }, { status:401 });
  const action = new URL(request.url).searchParams.get("action") || "status";
  try {
    if (action === "render") return NextResponse.json(await AvantiqoSyntheticIntelligenceReviewRuntimeV6.render());
    return NextResponse.json(await AvantiqoSyntheticIntelligenceReviewRuntimeV6.status());
  } catch (error) {
    console.error("SYNTHETIC_INTELLIGENCE_V6_REVIEW_FAILURE", { message:error?.message || null, stack:error?.stack || null });
    return NextResponse.json({ success:false, contract:AvantiqoSyntheticIntelligenceReviewRuntimeV6.CONTRACT, error:error?.message || "SYNTHETIC_INTELLIGENCE_V6_REVIEW_FAILED" }, { status:500 });
  }
}

export async function POST(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success:false, error:"UNAUTHORIZED" }, { status:401 });
  try { return NextResponse.json(await AvantiqoSyntheticIntelligenceReviewRuntimeV6.render()); }
  catch (error) {
    console.error("SYNTHETIC_INTELLIGENCE_V6_REVIEW_FAILURE", { message:error?.message || null, stack:error?.stack || null });
    return NextResponse.json({ success:false, contract:AvantiqoSyntheticIntelligenceReviewRuntimeV6.CONTRACT, error:error?.message || "SYNTHETIC_INTELLIGENCE_V6_REVIEW_FAILED" }, { status:500 });
  }
}
