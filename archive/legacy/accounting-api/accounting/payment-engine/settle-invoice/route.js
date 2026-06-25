import { NextResponse } from "next/server";

import { settleInvoice } from "@/lib/finance/payments/settleInvoice";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const settlement =
      await settleInvoice({
        tenantId:
          body.tenantId,
        invoiceId:
          body.invoiceId,
        paymentBatchId:
          body.paymentBatchId,
        amount:
          body.amount,
        entryDate:
          body.entryDate,
      });

    return NextResponse.json({
      success: true,
      settlement,
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
