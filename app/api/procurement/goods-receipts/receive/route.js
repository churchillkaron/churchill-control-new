import { NextResponse } from "next/server";

import { receiveGoods } from "@/lib/procurement/core/receiveGoods";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const receipt =
      await receiveGoods({
        tenantId:
          body.tenantId,
        purchaseOrderId:
          body.purchaseOrderId,
        itemId:
          body.itemId,
        quantity:
          body.quantity,
        unitCost:
          body.unitCost,
      });

    return NextResponse.json({
      success: true,
      receipt,
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
