import { NextResponse } from "next/server";

import { createCustomerInvoice } from "@/lib/finance/core/createCustomerInvoice";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const invoice =
      await createCustomerInvoice({
        tenantId:
          body.tenantId,
        customerName:
          body.customerName,
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
