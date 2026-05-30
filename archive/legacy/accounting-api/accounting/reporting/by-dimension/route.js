import { NextResponse } from "next/server";

import { getDimensionReporting } from "@/lib/finance/core/getDimensionReporting";

export async function POST(request) {
  try {
    const body = await request.json();

    const report =
      await getDimensionReporting({
        tenantId: body.tenantId,
        dimensionType: body.dimensionType,
        dimensionId: body.dimensionId,
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
