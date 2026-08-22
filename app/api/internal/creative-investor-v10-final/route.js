export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoInvestorFilmSyntheticIntelligenceV10RuntimeV3 } from "@/lib/investor-film/AvantiqoInvestorFilmSyntheticIntelligenceV10RuntimeV3";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

export async function GET(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success:false, error:"UNAUTHORIZED" }, { status:401 });
  const action = new URL(request.url).searchParams.get("action") || "status";
  try {
    if (action === "render") return NextResponse.json(await AvantiqoInvestorFilmSyntheticIntelligenceV10RuntimeV3.render());
    return NextResponse.json({ success:true, ...(await AvantiqoInvestorFilmSyntheticIntelligenceV10RuntimeV3.status()) });
  } catch (error) {
    return NextResponse.json({ success:false, contract:AvantiqoInvestorFilmSyntheticIntelligenceV10RuntimeV3.CONTRACT, error:error?.message || "INVESTOR_V10_FINAL_FAILED" }, { status:500 });
  }
}

export async function POST(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success:false, error:"UNAUTHORIZED" }, { status:401 });
  try { return NextResponse.json(await AvantiqoInvestorFilmSyntheticIntelligenceV10RuntimeV3.render()); }
  catch (error) { return NextResponse.json({ success:false, contract:AvantiqoInvestorFilmSyntheticIntelligenceV10RuntimeV3.CONTRACT, error:error?.message || "INVESTOR_V10_FINAL_FAILED" }, { status:500 }); }
}
