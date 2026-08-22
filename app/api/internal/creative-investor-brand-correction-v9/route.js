export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoInvestorFilmBrandCorrectionRuntime } from "@/lib/investor-film/AvantiqoInvestorFilmBrandCorrectionRuntime";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

export async function GET(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success:false, error:"UNAUTHORIZED" }, { status:401 });
  try { return NextResponse.json(await AvantiqoInvestorFilmBrandCorrectionRuntime.render()); }
  catch (error) { return NextResponse.json({ success:false, contract:AvantiqoInvestorFilmBrandCorrectionRuntime.CONTRACT, error:error?.message || "V9_BRAND_CORRECTION_FAILED" }, { status:500 }); }
}

export async function POST(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success:false, error:"UNAUTHORIZED" }, { status:401 });
  try { return NextResponse.json(await AvantiqoInvestorFilmBrandCorrectionRuntime.render()); }
  catch (error) { return NextResponse.json({ success:false, contract:AvantiqoInvestorFilmBrandCorrectionRuntime.CONTRACT, error:error?.message || "V9_BRAND_CORRECTION_FAILED" }, { status:500 }); }
}
