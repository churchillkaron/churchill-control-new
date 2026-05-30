import { NextResponse } from "next/server";

import { runPaymentBatch } from "@/lib/finance/core/runPaymentBatch";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const settlements =
      await runPaymentBatch({
        tenantId:
          body.tenantId,
        paymentBatchId:
          body.paymentBatchId,
        invoices:
          body.invoices || [],
        entryDate:
          body.entryDate,
      });

    return NextResponse.json({
      success: true,
      settlements,
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
