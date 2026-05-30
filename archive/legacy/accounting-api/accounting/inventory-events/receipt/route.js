import { NextResponse } from "next/server";

import { emitInventoryReceiptEvent } from "@/lib/finance/core/emitInventoryReceiptEvent";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await emitInventoryReceiptEvent({
        tenantId:
          body.tenantId,
        receiptId:
          body.receiptId,
        supplierId:
          body.supplierId,
        amount:
          body.amount,
        taxAmount:
          body.taxAmount,
        inventoryLocation:
          body.inventoryLocation,
        entryDate:
          body.entryDate,
      });

    return NextResponse.json({
      success: true,
      result,
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
