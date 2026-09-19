import { runCronRouteLocalFirst } from "@/lib/platform/service-runtime/policy/CronRouteComputePolicyRuntime";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { reconcileShopifyConnections } from "@/lib/commercial/commerce/ShopifyReconciliationRuntime";

function authorized(request) {
  const expected = String(process.env.CRON_SECRET || "").trim();
  return Boolean(expected) &&
    String(request.headers.get("authorization") || "").trim() === `Bearer ${expected}`;
}

async function handleCronGet(request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const result = await reconcileShopifyConnections({ connectionLimit: 5 });
    return NextResponse.json(result, {
      status: result.failed > 0 ? 207 : 200,
    });
  } catch (error) {
    console.error("SHOPIFY_RECONCILIATION_WORKER_FAILED", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "SHOPIFY_RECONCILIATION_WORKER_FAILED",
      },
      { status: 500 },
    );
  }
}

export async function GET(request) {
  return runCronRouteLocalFirst(() => handleCronGet(request), { source: "VERCEL_CRON" });
}
