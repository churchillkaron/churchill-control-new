import { NextResponse } from "next/server";

import { getCloseChecklistStatus } from "@/lib/finance/core/getCloseChecklistStatus";

export async function POST(request) {
  try {
    const body = await request.json();

    const status =
      await getCloseChecklistStatus({
        tenantId: body.tenantId,
        accountingPeriodId:
          body.accountingPeriodId,
      });

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 400,
      }
    );
  }
}
