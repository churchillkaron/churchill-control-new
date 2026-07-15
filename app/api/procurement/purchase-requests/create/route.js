import { NextResponse } from "next/server";

import { createPurchaseRequest } from "@/lib/inventory/procurement/purchase-orders/capabilities/createPurchaseRequest";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const requestData =
      await createPurchaseRequest({
        organization_id:
          body.organization_id ||
          body.organizationId,
        entity_id:
          body.entity_id ||
          body.entityId ||
          null,
        item:
          body.item || {
            id:
              body.item_id ||
              body.itemId,
            name:
              body.item_name ||
              body.itemName,
            quantity:
              body.quantity,
            reorder_level:
              body.reorder_level ||
              body.reorderLevel,
          },
      });

    return NextResponse.json({
      success: true,
      requestData,
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
