export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoInvestorFilmStudioMarketingRuntimeV1 } from "@/lib/investor-film/AvantiqoInvestorFilmStudioMarketingRuntimeV1";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

export async function GET(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success:false, error:"UNAUTHORIZED" }, { status:401 });
  const action = new URL(request.url).searchParams.get("action") || "status";
  if (action === "render") {
    try { return NextResponse.json(await AvantiqoInvestorFilmStudioMarketingRuntimeV1.render()); }
    catch (error) { return NextResponse.json({ success:false, contract:AvantiqoInvestorFilmStudioMarketingRuntimeV1.CONTRACT, error:error?.message || "STUDIO_MARKETING_RENDER_FAILED" }, { status:500 }); }
  }
  return NextResponse.json({ success:true, ...(await AvantiqoInvestorFilmStudioMarketingRuntimeV1.status()) });
}

export async function POST(request) {
  if (!(await authorizeInvestorV9Render(request))) return NextResponse.json({ success:false, error:"UNAUTHORIZED" }, { status:401 });
  try { return NextResponse.json(await AvantiqoInvestorFilmStudioMarketingRuntimeV1.render()); }
  catch (error) { return NextResponse.json({ success:false, contract:AvantiqoInvestorFilmStudioMarketingRuntimeV1.CONTRACT, error:error?.message || "STUDIO_MARKETING_RENDER_FAILED" }, { status:500 }); }
}
