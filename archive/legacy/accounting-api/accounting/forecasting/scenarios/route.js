import { NextResponse } from "next/server";

import { runForecastScenario } from "@/lib/finance/core/runForecastScenario";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const scenario =
      await runForecastScenario({
        tenantId:
          body.tenantId,
        scenarioName:
          body.scenarioName,
        revenueChangePercent:
          body.revenueChangePercent,
        expenseChangePercent:
          body.expenseChangePercent,
        baseProfit:
          body.baseProfit,
      });

    return NextResponse.json({
      success: true,
      scenario,
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
