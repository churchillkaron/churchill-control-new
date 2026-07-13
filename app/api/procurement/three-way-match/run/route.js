import { NextResponse } from "next/server";

import runThreeWayMatch from "@/lib/finance/accounts-payable/workflows/runThreeWayMatch";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const match =
      await runThreeWayMatch({
        vendor_invoice_id:
          body.vendor_invoice_id ||
          body.vendorInvoiceId ||
          body.invoice_id ||
          body.invoiceId,
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
