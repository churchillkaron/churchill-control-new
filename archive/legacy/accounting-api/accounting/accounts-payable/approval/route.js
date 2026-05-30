import { NextResponse } from "next/server";

import { approveVendorInvoice } from "@/lib/finance/core/approveVendorInvoice";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const approval =
      await approveVendorInvoice({
        tenantId:
          body.tenantId,
        invoiceId:
          body.invoiceId,
        approvedBy:
          body.approvedBy,
        approvalRole:
          body.approvalRole,
      });

    return NextResponse.json({
      success: true,
      approval,
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
