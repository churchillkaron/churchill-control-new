import { NextResponse } from "next/server";

import receivePurchaseOrder from "@/lib/inventory/procurement/receiving/receivePurchaseOrder";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const receipt =
      await receivePurchaseOrder({
        organization_id:
          body.organization_id ||
          body.organizationId,
        entity_id:
          body.entity_id ||
          body.entityId ||
          null,
        purchase_order_id:
          body.purchase_order_id ||
          body.purchaseOrderId,
        received_by:
          body.received_by ||
          body.receivedBy ||
          "WAREHOUSE",
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
