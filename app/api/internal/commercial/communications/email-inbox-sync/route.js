import { runCronRouteLocalFirst } from "@/lib/platform/service-runtime/policy/CronRouteComputePolicyRuntime";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  syncDueEmailConnections,
} from "@/lib/commercial/communications/CommunicationEmailInboxSyncRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

async function handleCronGet(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const result = await syncDueEmailConnections({ limit: 3 });
    return Response.json(result, {
      status: result.success ? 200 : 207,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Email inbox synchronization failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request) {
  return runCronRouteLocalFirst(() => handleCronGet(request), { source: "VERCEL_CRON" });
}
