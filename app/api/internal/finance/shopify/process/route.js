export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { processShopifyFinanceLifecycle } from "@/lib/finance/integrations/ShopifyFinanceLifecycleRuntime";

function authorized(request) {
  const expected = String(process.env.CRON_SECRET || "").trim();
  const actual = String(request.headers.get("authorization") || "").trim();
  return Boolean(expected) && actual === `Bearer ${expected}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const result = await processShopifyFinanceLifecycle({ limit: 20 });
    return NextResponse.json(result, {
      status: result.failed > 0 ? 207 : 200,
    });
  } catch (error) {
    console.error("SHOPIFY_FINANCE_LIFECYCLE_WORKER_FAILED", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "SHOPIFY_FINANCE_LIFECYCLE_WORKER_FAILED",
      },
      { status: 500 },
    );
  }
}
