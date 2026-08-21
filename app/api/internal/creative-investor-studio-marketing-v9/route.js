export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoInvestorFilmStudioMarketingRuntimeV1 } from "@/lib/investor-film/AvantiqoInvestorFilmStudioMarketingRuntimeV1";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

export async function GET(request) {
  if (!(await authorizeInvestorV9Render(request))) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const status = await AvantiqoInvestorFilmStudioMarketingRuntimeV1.status();
  return NextResponse.json({ success: true, ...status });
}

export async function POST(request) {
  if (!(await authorizeInvestorV9Render(request))) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await AvantiqoInvestorFilmStudioMarketingRuntimeV1.render();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        contract: AvantiqoInvestorFilmStudioMarketingRuntimeV1.CONTRACT,
        error: error?.message || "STUDIO_MARKETING_RENDER_FAILED",
      },
      { status: 500 },
    );
  }
}
