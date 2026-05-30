import { NextResponse } from "next/server";

import { runVarianceAnalysis } from "@/lib/inventory/core/runVarianceAnalysis";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const analysis =
      await runVarianceAnalysis({
        tenantId:
          body.tenantId,
        itemId:
          body.itemId,
        varianceQuantity:
          body.varianceQuantity,
        varianceValue:
          body.varianceValue,
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
