export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoInvestorFilmAvantiqoFirstChaptersV2 } from "@/lib/investor-film/AvantiqoInvestorFilmAvantiqoFirstChaptersV2";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

async function render(request) {
  if (!(await authorizeInvestorV9Render(request))) {
    return NextResponse.json({ success:false, error:"UNAUTHORIZED" }, { status:401 });
  }
  try {
    return NextResponse.json(await AvantiqoInvestorFilmAvantiqoFirstChaptersV2.render());
  } catch (error) {
    console.error("INVESTOR_AVANTIQO_FIRST_V2_FAILURE", { message:error?.message || null, stack:error?.stack || null });
    return NextResponse.json({ success:false, contract:AvantiqoInvestorFilmAvantiqoFirstChaptersV2.CONTRACT, error:error?.message || "INVESTOR_AVANTIQO_FIRST_V2_FAILED" }, { status:500 });
  }
}

export async function GET(request) { return render(request); }
export async function POST(request) { return render(request); }
