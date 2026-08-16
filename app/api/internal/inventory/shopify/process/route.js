export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { processShopifyInventorySync } from "@/lib/inventory/integrations/ShopifyInventorySyncRuntime";

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
    const result = await processShopifyInventorySync({ limit: 25 });
    return NextResponse.json(result, {
      status: result.failed > 0 ? 207 : 200,
    });
  } catch (error) {
    console.error("SHOPIFY_INVENTORY_SYNC_WORKER_FAILED", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "SHOPIFY_INVENTORY_SYNC_WORKER_FAILED",
      },
      { status: 500 },
    );
  }
}
