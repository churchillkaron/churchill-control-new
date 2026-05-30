import { NextResponse } from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import {
  emitEvent,
} from "@/lib/shared/events/eventBus";

export async function POST() {

  const tenantId =
    "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  const {
    data: purchaseOrder,
  } = await supabaseAdmin
    .from("purchase_orders")
    .select(`
      *,
      purchase_order_items (*)
    `)
    .eq(
      "tenant_id",
      tenantId
    )
    .limit(1)
    .single();

  if (!purchaseOrder) {

    return NextResponse.json({

      success: false,

      error:
        "NO_PURCHASE_ORDER_FOUND",

    });

  }

  const result =
    await emitEvent(

      "GOODS_RECEIPT_CREATED",

      {

        tenantId,

        goodsReceiptId:
          crypto.randomUUID(),

        purchaseOrderId:
          purchaseOrder.id,

        purchaseOrder,

        receivedBy:
          "system",

      }

    );

  return NextResponse.json({

    success: true,

    result,

  });

}
