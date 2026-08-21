export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoInvestorFilmCrossDomainGovernanceRuntimeV1 } from "@/lib/investor-film/AvantiqoInvestorFilmCrossDomainGovernanceRuntimeV1";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

export async function GET(request) {
  if (!(await authorizeInvestorV9Render(request))) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const status = await AvantiqoInvestorFilmCrossDomainGovernanceRuntimeV1.status();
  return NextResponse.json({ success: true, ...status });
}

export async function POST(request) {
  if (!(await authorizeInvestorV9Render(request))) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const result = await AvantiqoInvestorFilmCrossDomainGovernanceRuntimeV1.render();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        contract: AvantiqoInvestorFilmCrossDomainGovernanceRuntimeV1.CONTRACT,
        error: error?.message || "CROSS_DOMAIN_GOVERNANCE_RENDER_FAILED",
      },
      { status: 500 },
    );
  }
}
