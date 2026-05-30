import { NextResponse } from "next/server";

import { reopenAccountingPeriod } from "@/lib/finance/core/reopenAccountingPeriod";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const period =
      await reopenAccountingPeriod({
        tenantId:
          body.tenantId,
        accountingPeriod:
          body.accountingPeriod,
        reopenedBy:
          body.reopenedBy,
      });

    return NextResponse.json({
      success: true,
      period,
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
