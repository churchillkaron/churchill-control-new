import { NextResponse } from "next/server";

import { generateConsolidatedReport } from "@/lib/finance/core/generateConsolidatedReport";

export async function POST(request) {
  try {
    const body = await request.json();

    const report =
      await generateConsolidatedReport({
        tenantIds: body.tenantIds,
        startDate: body.startDate,
        endDate: body.endDate,
      });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 400,
      }
    );
  }
}
