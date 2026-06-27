import { NextResponse } from "next/server";

import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";
import { updateStockLedger } from "@/lib/inventory/ledger/capabilities/updateStockLedger";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const movement =
      await createInventoryMovement({
        tenantId:
          body.tenantId,
        itemId:
          body.itemId,
        movementType:
          body.movementType,
        quantity:
          body.quantity,
        unitCost:
          body.unitCost,
        referenceType:
          body.referenceType,
        referenceId:
          body.referenceId,
      });

    const ledger =
      await updateStockLedger({
        tenantId:
          body.tenantId,
        itemId:
          body.itemId,
      });

    return NextResponse.json({
      success: true,
      movement,
      ledger,
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
