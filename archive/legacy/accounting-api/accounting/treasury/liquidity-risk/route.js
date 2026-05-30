import { NextResponse } from "next/server";

import { runLiquidityRiskAnalysis } from "@/lib/finance/core/runLiquidityRiskAnalysis";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const analysis =
      await runLiquidityRiskAnalysis({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      analysis,
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
