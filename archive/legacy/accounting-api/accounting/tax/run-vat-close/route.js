import { NextResponse } from "next/server";

import { runVATClose } from "@/lib/finance/core/runVATClose";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runVATClose({
        tenantId:
          body.tenantId,
        filingPeriod:
          body.filingPeriod,
        startDate:
          body.startDate,
        endDate:
          body.endDate,
        vatPayableAccountId:
          body.vatPayableAccountId,
        vatReceivableAccountId:
          body.vatReceivableAccountId,
        taxSettlementAccountId:
          body.taxSettlementAccountId,
      });

    return NextResponse.json({
      success: true,
      result,
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
