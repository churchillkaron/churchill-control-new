import { NextResponse } from "next/server";

import { processCustomerPayment } from "@/lib/finance/core/processCustomerPayment";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const payment =
      await processCustomerPayment({
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
