import { NextResponse } from "next/server";

import receivePurchaseOrder from "@/lib/procurement/receiving/receivePurchaseOrder";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await receivePurchaseOrder({

        purchase_order_id:
          body.purchase_order_id,

        received_by:
          body.received_by || "WAREHOUSE",
      });

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {

        success: false,

        error:
          error.message,
      },
      {

        status: 500,
      }
    );
  }
}
