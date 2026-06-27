import { NextResponse } from "next/server";

import runThreeWayMatch from "@/lib/finance/accounts-payable/workflows/runThreeWayMatch";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const match =
      await runThreeWayMatch({
        tenantId:
          body.tenantId,
        purchaseOrderId:
          body.purchaseOrderId,
        goodsReceiptId:
          body.goodsReceiptId,
        invoiceReference:
          body.invoiceReference,
        invoiceTotal:
          body.invoiceTotal,
      });

    return NextResponse.json({
      success: true,
      match,
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
