import { NextResponse } from "next/server";

import { runInventoryReconciliation } from "@/lib/inventory/stock-count/workflows/runInventoryReconciliation";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const reconciliation =
      await runInventoryReconciliation({
        organizationId:
          body.organizationId ||
          body.organization_id,
        entityId:
          body.entityId ||
          body.entity_id,
        itemId:
          body.itemId ||
          body.item_id,
        actualQuantity:
          body.actualQuantity ||
          body.actual_quantity,
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
