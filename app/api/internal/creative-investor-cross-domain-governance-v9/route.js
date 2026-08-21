export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoInvestorFilmCrossDomainGovernanceRuntimeV1 } from "@/lib/investor-film/AvantiqoInvestorFilmCrossDomainGovernanceRuntimeV1";

function authorized(request) {
  const expected = process.env.AVANTIQO_INVESTOR_INTERNAL_TOKEN || "";
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const queryToken = new URL(request.url).searchParams.get("token") || "";
  return bearer === expected || queryToken === expected;
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const status = await AvantiqoInvestorFilmCrossDomainGovernanceRuntimeV1.status();
  return NextResponse.json({ success: true, ...status });
}

export async function POST(request) {
  if (!authorized(request)) {
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
