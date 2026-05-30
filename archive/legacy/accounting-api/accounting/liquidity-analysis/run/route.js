import { NextResponse } from "next/server";

import { runLiquidityAnalysis } from "@/lib/finance/core/runLiquidityAnalysis";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const analysis =
      await runLiquidityAnalysis({
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
