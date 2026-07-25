export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  run as runReport,
} from "@/lib/finance/reporting/runtime/ReportingApplicationService";
import {
  resolveReportRequestContext,
} from "@/lib/finance/reporting/runtime/resolveReportRequestContext";

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

    const result = await runReport("trial_balance", {
      organizationId: context.organizationId,
      entityId: context.entityId,
      periodId: context.periodId,
      startDate: context.startDate,
      endDate: context.endDate,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("trial-balance GET", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Trial balance failed",
        details: error.details || null,
        hint: error.hint || null,
        code: error.code || null,
      },
      { status: 500 }
    );
  }
}
