import { NextResponse } from "next/server";

import processVendorPayment from "@/lib/finance/payments/processVendorPayment";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await processVendorPayment({

        accounts_payable_id:
          body.accounts_payable_id,

        payment_method:
          body.payment_method,

        paid_by:
          body.paid_by || "ACCOUNTING",
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
