export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { processDueServicePlans } from "@/lib/service-management/runtime/ServicePlanSchedulerRuntime";

function authorized(request) {
  const expected = String(process.env.CRON_SECRET || "").trim();
  const actual = String(request.headers.get("authorization") || "").trim();
  return Boolean(expected) && actual === `Bearer ${expected}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ success: false }, { status: 401 });
  }

  try {
    const result = await processDueServicePlans({ limit: 50 });
    return Response.json(result, {
      status: result.failed > 0 ? 207 : 200,
    });
  } catch (error) {
    console.error("SERVICE_PLAN_SCHEDULER_FAILED", error);
    return Response.json(
      {
        success: false,
        error: error?.message || "SERVICE_PLAN_SCHEDULER_FAILED",
      },
      { status: 500 },
    );
  }
}
