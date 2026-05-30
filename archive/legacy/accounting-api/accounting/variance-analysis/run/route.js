import { NextResponse } from "next/server";

import { runVarianceAnalysis } from "@/lib/finance/core/runVarianceAnalysis";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const variance =
      await runVarianceAnalysis({
        tenantId:
          body.tenantId,
        varianceType:
          body.varianceType,
        referenceId:
          body.referenceId,
        expectedAmount:
          body.expectedAmount,
        actualAmount:
          body.actualAmount,
      });

    return NextResponse.json({
      success: true,
      variance,
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
