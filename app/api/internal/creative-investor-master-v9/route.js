export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoInvestorFilmMasterV9Runtime } from "@/lib/investor-film/AvantiqoInvestorFilmMasterV9Runtime";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

export async function GET(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success:false, error:"UNAUTHORIZED" }, { status:401 });
  const action = new URL(request.url).searchParams.get("action") || "status";
  try {
    if (action === "render") return NextResponse.json(await AvantiqoInvestorFilmMasterV9Runtime.render());
    return NextResponse.json({ success:true, ...(await AvantiqoInvestorFilmMasterV9Runtime.status()) });
  } catch (error) {
    return NextResponse.json({ success:false, contract:AvantiqoInvestorFilmMasterV9Runtime.CONTRACT, error:error?.message || (action === "render" ? "V9_MASTER_RENDER_FAILED" : "V9_MASTER_STATUS_FAILED") }, { status:500 });
  }
}

export async function POST(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success:false, error:"UNAUTHORIZED" }, { status:401 });
  try { return NextResponse.json(await AvantiqoInvestorFilmMasterV9Runtime.render()); }
  catch (error) { return NextResponse.json({ success:false, contract:AvantiqoInvestorFilmMasterV9Runtime.CONTRACT, error:error?.message || "V9_MASTER_RENDER_FAILED" }, { status:500 }); }
}
