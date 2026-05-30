import { NextResponse } from "next/server";

import { runRegulatoryReporting } from "@/lib/finance/core/runRegulatoryReporting";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const report =
      await runRegulatoryReporting({
        tenantId:
          body.tenantId,
        reportType:
          body.reportType,
        reportingPeriod:
          body.reportingPeriod,
      });

    return NextResponse.json({
      success: true,
      report,
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
