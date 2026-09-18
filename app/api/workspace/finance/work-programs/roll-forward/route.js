export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "Direct work-program roll-forward is retired. The recurring-cycle planner owns the next governed accounting cycle.",
      code: "DIRECT_WORK_PROGRAM_ROLL_FORWARD_RETIRED",
      canonical_plan_endpoint: "/api/workspace/finance/recurring-plan",
      canonical_creation_endpoint: "/api/workspace/finance/recurring-materialize",
    },
    { status: 409 },
  );
}
