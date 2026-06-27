import { NextResponse } from "next/server";

import { runInventoryReconciliation } from "@/lib/inventory/stock-count/workflows/runInventoryReconciliation";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const reconciliation =
      await runInventoryReconciliation({
        tenantId:
          body.tenantId,
        itemId:
          body.itemId,
        actualQuantity:
          body.actualQuantity,
      });

    return NextResponse.json({
      success: true,
      reconciliation,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
