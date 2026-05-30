import { NextResponse } from "next/server";

import { runCashflowForecast } from "@/lib/finance/core/runCashflowForecast";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const forecast =
      await runCashflowForecast({
        tenantId:
          body.tenantId,
        period:
          body.period,
      });

    return NextResponse.json({
      success: true,
      forecast,
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
