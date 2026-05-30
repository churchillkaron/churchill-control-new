import { NextResponse } from "next/server";

import { runFXRevaluation } from "@/lib/finance/core/runFXRevaluation";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runFXRevaluation({
        tenantId:
          body.tenantId,
        sourceCurrency:
          body.sourceCurrency,
        targetCurrency:
          body.targetCurrency,
        amount:
          body.amount,
      });

    return NextResponse.json({
      success: true,
      result,
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
