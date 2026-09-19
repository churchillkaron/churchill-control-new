import { runCronRouteLocalFirst } from "@/lib/platform/service-runtime/policy/CronRouteComputePolicyRuntime";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { repairPublishedDuplicateReplies } from "@/lib/commercial/reputation/ReputationAutomationRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  return Boolean(secret) &&
    request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handleCronGet(request) {
  if (!authorized(request)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const organizationId = String(url.searchParams.get("organization_id") || "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 10, 1), 50);

  if (!organizationId) {
    return Response.json(
      { success: false, error: "organization_id required" },
      { status: 400 },
    );
  }

  try {
    const result = await repairPublishedDuplicateReplies({
      organizationId,
      limit,
    });
    return Response.json({ success: true, organizationId, ...result });
  } catch (error) {
    return Response.json(
      {
        success: false,
        organizationId,
        error: error?.message || "Duplicate review repair failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request) {
  return runCronRouteLocalFirst(() => handleCronGet(request), { source: "VERCEL_CRON" });
}
