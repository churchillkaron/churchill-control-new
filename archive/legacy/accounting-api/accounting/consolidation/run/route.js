import { NextResponse } from "next/server";

import { runConsolidation } from "@/lib/finance/consolidation/runConsolidation";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runConsolidation({
        parentTenantId:
          body.parentTenantId,
        tenantIds:
          body.tenantIds || [],
        reportingPeriod:
          body.reportingPeriod,
        startDate:
          body.startDate,
        endDate:
          body.endDate,
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
