import { NextResponse }
from "next/server";

import autoCloseOrder
from "@/lib/pos/orders/autoCloseOrder";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await autoCloseOrder(
        body.orderId
      );

    return NextResponse.json({

      success: true,

      result,

    });

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
