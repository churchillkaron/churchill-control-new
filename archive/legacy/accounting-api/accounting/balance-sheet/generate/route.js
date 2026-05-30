import { NextResponse } from "next/server";

import { generateBalanceSheet } from "@/lib/finance/core/generateBalanceSheet";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const sheet =
      await generateBalanceSheet({
        tenantId:
          body.tenantId,
        reportingPeriod:
          body.reportingPeriod,
      });

    return NextResponse.json({
      success: true,
      sheet,
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
