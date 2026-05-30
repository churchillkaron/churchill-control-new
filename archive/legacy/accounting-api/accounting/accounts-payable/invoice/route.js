import { NextResponse } from "next/server";

import { createVendorInvoice } from "@/lib/finance/core/createVendorInvoice";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const invoice =
      await createVendorInvoice({
        tenantId:
          body.tenantId,
        vendorName:
          body.vendorName,
        invoiceNumber:
          body.invoiceNumber,
        invoiceDate:
          body.invoiceDate,
        dueDate:
          body.dueDate,
        invoiceAmount:
          body.invoiceAmount,
      });

    return NextResponse.json({
      success: true,
      invoice,
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
