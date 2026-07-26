export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { resolveReportRequestContext } from "@/lib/finance/reporting/runtime/resolveReportRequestContext";
import { generateCashflow } from "@/lib/finance/reporting/reports/generateCashflow";

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

    const result = await generateCashflow({
      organizationId: context.organizationId,
      entityId: context.entityId,
      startDate: context.startDate,
      endDate: context.endDate,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      entityId: context.entityId,
      periodId: context.periodId,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Cash flow failed",
        code: error.code || null,
      },
      { status: Number(error.status) || 500 }
    );
  }
}
