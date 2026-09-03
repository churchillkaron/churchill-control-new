export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

import {
  inspectAvantiqoLearningHealth,
} from "@/lib/intelligence/runtime/AvantiqoLearningHealthRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const health = await inspectAvantiqoLearningHealth();
    return Response.json(health, { status: health.operational ? 200 : 503 });
  } catch (error) {
    console.error("AVANTIQO_LEARNING_HEALTH_FAILED", error);
    return Response.json(
      {
        success: false,
        status: "HEALTH_CHECK_FAILED",
        operational: false,
        error: error?.message || "Learning health check failed",
      },
      { status: 500 },
    );
  }
}
