import { NextResponse } from "next/server";

import { runTaxFiling } from "@/lib/finance/core/runTaxFiling";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const filing =
      await runTaxFiling({
        tenantId:
          body.tenantId,
        filingPeriod:
          body.filingPeriod,
        taxName:
          body.taxName,
      });

    return NextResponse.json({
      success: true,
      filing,
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
