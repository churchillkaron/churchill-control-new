import { NextResponse } from "next/server";

import { runYearEndClose } from "@/lib/finance/core/runYearEndClose";

export async function POST(request) {
  try {
    const body = await request.json();

    const result =
      await runYearEndClose({
        tenantId: body.tenantId,
        accountingPeriodId:
          body.accountingPeriodId,
        startDate:
          body.startDate,
        endDate:
          body.endDate,
        retainedEarningsAccountId:
          body.retainedEarningsAccountId,
        incomeSummaryAccountId:
          body.incomeSummaryAccountId,
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
