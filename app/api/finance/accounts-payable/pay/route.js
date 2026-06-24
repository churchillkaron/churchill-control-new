import {
  requireAuth,
} from "@/lib/shared/auth";

import { NextResponse } from "next/server";

import processVendorPayment from "@/lib/finance/payments/processVendorPayment";

export async function POST(req) {

  try {

    await requireAuth();

    const body =
      await req.json();

    const result =
      await processVendorPayment({

        accounts_payable_id:
          body.payable_id,

        payment_method:
          body.payment_method,

        paid_by:
          body.paid_by,

      });

    return NextResponse.json({
      success: result.success,
      ...result,
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
