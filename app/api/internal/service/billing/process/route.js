export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  ServiceBillingQueueRuntime,
} from "@/lib/platform/service-runtime/billing/runtime/ServiceBillingQueueRuntime";

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
      Math.min(Number(url.searchParams.get("limit")) || 25, 100),
    );
    const result = await ServiceBillingQueueRuntime.process({ limit });
    return Response.json(result, {
      status: result.dead_letter > 0 ? 207 : 200,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Service billing queue processing failed",
      },
      { status: 500 },
    );
  }
}
