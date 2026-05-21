import { NextResponse }
from "next/server";

import {
  emitEvent,
} from "@/lib/shared/events/eventBus";

import {
  SIGNAL_TYPES,
} from "@/lib/signals/signalTypes";

export async function POST() {

  const result =
    await emitEvent(

      SIGNAL_TYPES.ORDER_COMPLETED,

      {

        tenantId:
          "demo-tenant",

        orderId:
          "ORD-1001",

        total:
          4200,

      }

    );

  return NextResponse.json({

    success: true,

    result,

  });

}
