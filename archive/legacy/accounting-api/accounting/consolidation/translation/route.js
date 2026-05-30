import { NextResponse } from "next/server";

import { runCurrencyTranslation } from "@/lib/finance/core/runCurrencyTranslation";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const translation =
      await runCurrencyTranslation({
        tenantId:
          body.tenantId,
        sourceCurrency:
          body.sourceCurrency,
        targetCurrency:
          body.targetCurrency,
        exchangeRate:
          body.exchangeRate,
        amount:
          body.amount,
      });

    return NextResponse.json({
      success: true,
      translation,
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
