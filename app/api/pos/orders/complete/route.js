import { NextResponse } from "next/server";

import { completeOrderFlow }
from "@/lib/production/completeOrderFlow";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await completeOrderFlow(

        body.order_id,

        body.tenant_id

      );

    return NextResponse.json(
      result
    );

  } catch (error) {

    console.error(
      "COMPLETE ORDER FLOW ERROR",
      error
    );

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
