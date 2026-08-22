export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  runOperatorAutonomousWatchBatch,
} from "@/lib/operator/runtime/OperatorAutonomousWatchRuntime";

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
    const result = await runOperatorAutonomousWatchBatch({ limit });
    return Response.json(result, {
      status: result.failed_count > 0 ? 207 : 200,
    });
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
