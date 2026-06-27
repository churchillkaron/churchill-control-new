import { NextResponse } from "next/server";

import receivePurchaseOrder from "@/lib/procurement/receiving/receivePurchaseOrder";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const receipt =
      await receivePurchaseOrder({
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
