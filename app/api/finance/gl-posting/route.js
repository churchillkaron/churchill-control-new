import { NextResponse } from "next/server";

import postVendorPaymentGL from "@/lib/finance/gl-posting/postVendorPaymentGL";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await postVendorPaymentGL({

        tenant_id:
          body.tenant_id,

        payment_id:
          body.payment_id,

        amount:
          body.amount,
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
