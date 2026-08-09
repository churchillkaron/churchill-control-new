export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  ManagedMediaReconciliationRuntime,
} from "@/lib/marketing/services/ManagedMediaReconciliationRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const authorization = request.headers.get("authorization") || "";
  return authorization === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const url = new URL(request.url);
    const limit = Math.max(
      1,
      Math.min(Number(url.searchParams.get("limit")) || 50, 200)
    );
    const result = await ManagedMediaReconciliationRuntime.reconcile({
      limit,
      provider: "meta",
    });
    return Response.json(result, { status: result.failed ? 207 : 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Managed Meta media reconciliation failed",
      },
      { status: 500 }
    );
  }
}
