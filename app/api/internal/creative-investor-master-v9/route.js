export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { NextResponse } from "next/server";
import { AvantiqoInvestorFilmMasterV9Runtime } from "@/lib/investor-film/AvantiqoInvestorFilmMasterV9Runtime";

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

  try {
    const status = await AvantiqoInvestorFilmMasterV9Runtime.status();
    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "V9_MASTER_STATUS_FAILED" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await AvantiqoInvestorFilmMasterV9Runtime.render();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        contract: AvantiqoInvestorFilmMasterV9Runtime.CONTRACT,
        error: error?.message || "V9_MASTER_RENDER_FAILED",
      },
      { status: 500 },
    );
  }
}
