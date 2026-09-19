import { runCronRouteLocalFirst } from "@/lib/platform/service-runtime/policy/CronRouteComputePolicyRuntime";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { processDueScheduledReports } from "@/lib/finance/reporting/runtime/ScheduledReportService";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

async function handleCronGet(request) {
  if (!authorized(request)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDueScheduledReports();
    return Response.json(result, { status: result.failed > 0 ? 207 : 200 });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Scheduled Finance report processing failed" },
      { status: 500 }
    );
  }
}
export async function GET(request) {
  return runCronRouteLocalFirst(() => handleCronGet(request), { source: "VERCEL_CRON" });
}
