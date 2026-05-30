import { NextResponse }
from "next/server";

import {
  emitEvent,
} from "@/lib/shared/events/eventBus";

export async function POST() {

  const result =
    await emitEvent(

      "VENDOR_PAYMENT",

      {

        tenantId:
          "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4",

        paymentId:
          crypto.randomUUID(),

        amount:
          1200,

        createdBy:
          "system",

      }

    );

  return NextResponse.json({

    success: true,

    result,

  });

}
