export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  runOperatorAutonomousWatchBatch,
} from "@/lib/operator/runtime/OperatorAutonomousWatchRuntime";
import {
  runOperatorProactiveDeliveryForWatchResults,
} from "@/lib/operator/runtime/OperatorProactiveDeliveryBatchRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const url = new URL(request.url);
    const limit = Math.max(
      1,
      Math.min(Number(url.searchParams.get("limit")) || 2, 4),
    );
    const watch = await runOperatorAutonomousWatchBatch({ limit });
    const proactiveDelivery = await runOperatorProactiveDeliveryForWatchResults({
      watchResults: watch.results,
    });
    const failedCount = Number(watch.failed_count || 0) + Number(proactiveDelivery.failed_count || 0);
    return Response.json(
      {
        ...watch,
        success: watch.success === true && proactiveDelivery.success === true,
        proactive_delivery: proactiveDelivery,
      },
      { status: failedCount > 0 ? 207 : 200 },
    );
  } catch (error) {
    console.error("OPERATOR_AUTONOMOUS_WATCH_CRON_FAILED", error);
    return Response.json(
      {
        success: false,
        error: error?.message || "Autonomous Operator watch failed",
      },
      { status: 500 },
    );
  }
}
