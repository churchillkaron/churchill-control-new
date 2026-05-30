import { NextResponse } from "next/server";

import { generateFinancialStatements } from "@/lib/finance/core/generateFinancialStatements";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const statement =
      await generateFinancialStatements({
        tenantId:
          body.tenantId,
        reportingPeriod:
          body.reportingPeriod,
      });

    return NextResponse.json({
      success: true,
      statement,
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
