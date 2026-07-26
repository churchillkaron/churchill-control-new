export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getManagementReport } from "@/lib/finance/reporting/reports/getManagementReport";
import { resolveReportRequestContext } from "@/lib/finance/reporting/runtime/resolveReportRequestContext";

export async function GET(request) {
  try {
    const context = await resolveReportRequestContext(
      new URL(request.url).searchParams
    );

    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 400 }
      );
    }

    const result = await getManagementReport({
      organizationId: context.organizationId,
      entityId: context.entityId,
      startDate: context.startDate,
      endDate: context.endDate,
    });

    return NextResponse.json({
      success: true,
      report: result,
      rows: [result],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Management report failed",
      },
      { status: error.status || 500 }
    );
  }
}
