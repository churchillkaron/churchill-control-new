import { NextResponse } from "next/server";

import { runPaymentPriorityQueue } from "@/lib/finance/payments/workflows/runPaymentPriorityQueue";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const queue =
      await runPaymentPriorityQueue({
        organizationId:
          body.organizationId,
        invoices:
          body.invoices,
      });

    return NextResponse.json({
      success: true,
      queue,
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
