export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { run } from "@/lib/finance/reporting/runtime/ReportingApplicationService";
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

    return NextResponse.json(await run("balance_sheet", {
      organizationId: context.organizationId,
      entityId: context.entityId,
      periodId: context.periodId,
      startDate: context.startDate,
      endDate: context.endDate,
    }));
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Balance sheet failed" },
      { status: 500 }
    );
  }
}
