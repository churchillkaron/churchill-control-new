export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoInvestorFilmBusinessPartnerRuntimeV1 } from "@/lib/investor-film/AvantiqoInvestorFilmBusinessPartnerRuntimeV1";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

export async function GET(request) {
  if (!(await authorizeInvestorV9Render(request))) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const status = await AvantiqoInvestorFilmBusinessPartnerRuntimeV1.status();
  return NextResponse.json({ success: true, ...status });
}

export async function POST(request) {
  if (!(await authorizeInvestorV9Render(request))) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await AvantiqoInvestorFilmBusinessPartnerRuntimeV1.render();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        contract: AvantiqoInvestorFilmBusinessPartnerRuntimeV1.CONTRACT,
        error: error?.message || "BUSINESS_PARTNER_RENDER_FAILED",
      },
      { status: 500 },
    );
  }
}
