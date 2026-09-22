export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  ReconciledPaymentSettlementRuntime,
} from "@/lib/platform/payment-runtime/reconciliation/ReconciledPaymentSettlementRuntime";

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
      Math.min(Number(url.searchParams.get("limit")) || 200, 1000),
    );

    const result = await ReconciledPaymentSettlementRuntime.reconcile({
      limit,
    });

    return Response.json(result, {
      status: result.failed > 0 ? 207 : 200,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error?.message ||
          "Reconciled payment settlement process failed",
      },
      { status: 500 },
    );
  }
}
