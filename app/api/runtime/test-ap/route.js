import { NextResponse }
from "next/server";

import {
  emitEvent,
} from "@/lib/shared/events/eventBus";

export async function POST() {

  const result =
    await emitEvent(

      "VENDOR_INVOICE_CREATED",

      {

        tenantId:
          "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4",

        invoiceId:
          crypto.randomUUID(),

        amount:
          2200,

        createdBy:
          "system",

      }

    );

  return NextResponse.json({

    success: true,

    result,

  });

}
