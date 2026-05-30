import { NextResponse } from "next/server";

import { runLiquidityAnalysis } from "@/lib/intelligence/finance/runLiquidityAnalysis";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const liquidity =
      await runLiquidityAnalysis({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      liquidity,
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
