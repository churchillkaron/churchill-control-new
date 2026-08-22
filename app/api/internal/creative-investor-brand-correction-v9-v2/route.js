export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoInvestorFilmBrandCorrectionRuntimeV2 } from "@/lib/investor-film/AvantiqoInvestorFilmBrandCorrectionRuntimeV2";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

export async function GET(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success:false, error:"UNAUTHORIZED" }, { status:401 });
  try { return NextResponse.json(await AvantiqoInvestorFilmBrandCorrectionRuntimeV2.render()); }
  catch (error) { return NextResponse.json({ success:false, contract:AvantiqoInvestorFilmBrandCorrectionRuntimeV2.CONTRACT, error:error?.message || "V9_BRAND_CORRECTION_V2_FAILED" }, { status:500 }); }
}

export async function POST(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success:false, error:"UNAUTHORIZED" }, { status:401 });
  try { return NextResponse.json(await AvantiqoInvestorFilmBrandCorrectionRuntimeV2.render()); }
  catch (error) { return NextResponse.json({ success:false, contract:AvantiqoInvestorFilmBrandCorrectionRuntimeV2.CONTRACT, error:error?.message || "V9_BRAND_CORRECTION_V2_FAILED" }, { status:500 }); }
}
