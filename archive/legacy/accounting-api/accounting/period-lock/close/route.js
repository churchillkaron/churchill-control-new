import { NextResponse } from "next/server";

import { lockAccountingPeriod } from "@/lib/finance/core/lockAccountingPeriod";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const period =
      await lockAccountingPeriod({
        tenantId:
          body.tenantId,
        accountingPeriod:
          body.accountingPeriod,
        lockedBy:
          body.lockedBy,
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
