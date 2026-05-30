import { NextResponse } from "next/server";

import { createPurchaseOrder } from "@/lib/procurement/core/createPurchaseOrder";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const order =
      await createPurchaseOrder({
        tenantId:
          body.tenantId,
        purchaseRequestId:
          body.purchaseRequestId,
        vendorId:
          body.vendorId,
        poTotal:
          body.poTotal,
      });

    return NextResponse.json({
      success: true,
      order,
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
