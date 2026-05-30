import { NextResponse } from "next/server";

import { processVendorPayment } from "@/lib/finance/core/processVendorPayment";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const payment =
      await processVendorPayment({
        tenantId:
          body.tenantId,
        invoiceId:
          body.invoiceId,
        paymentReference:
          body.paymentReference,
        paymentAmount:
          body.paymentAmount,
        paymentMethod:
          body.paymentMethod,
      });

    return NextResponse.json({
      success: true,
      payment,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
