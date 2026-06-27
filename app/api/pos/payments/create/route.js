import { NextResponse } from "next/server";

import {
  createPayment,
} from "@/lib/pos/createPayment";

export async function POST(req) {

  try {

    const body =
      await req.json();

    console.log(
      "[PAYMENT_REQUEST]",
      body
    );

    const result =
      await createPayment({

        organizationId:
          body.organizationId,

        tableNumber:
          body.tableNumber,

        paymentMethod:
          body.paymentMethod,

        cashierName:
          body.cashierName,

        paidAmount:
          body.paidAmount,

      });

    return NextResponse.json(
      result
    );

  } catch (error) {

    console.error(
      "CREATE PAYMENT ERROR",
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
