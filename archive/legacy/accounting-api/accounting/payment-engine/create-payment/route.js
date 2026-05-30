import { NextResponse } from "next/server";

import { createPaymentBatch } from "@/lib/finance/core/createPaymentBatch";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const batch =
      await createPaymentBatch({
        tenantId:
          body.tenantId,
        paymentType:
          body.paymentType,
        invoices:
          body.invoices || [],
      });

    return NextResponse.json({
      success: true,
      batch,
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
