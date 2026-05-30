import { NextResponse } from "next/server";

import { runTreasuryForecast } from "@/lib/finance/core/runTreasuryForecast";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const forecast =
      await runTreasuryForecast({
        tenantId:
          body.tenantId,
        forecastPeriod:
          body.forecastPeriod,
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
