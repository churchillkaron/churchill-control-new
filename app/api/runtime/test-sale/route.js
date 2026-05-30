import { NextResponse }
from "next/server";

import {
  emitEvent,
} from "@/lib/shared/events/eventBus";

export async function POST() {

  const result =
    await emitEvent(

      "SALE_COMPLETED",

      {

        tenantId:
          "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4",

        saleId:
          crypto.randomUUID(),

        amount:
          5000,

        createdBy:
          "system",

      }

    );

  return NextResponse.json({

    success: true,

    result,

  });

}
