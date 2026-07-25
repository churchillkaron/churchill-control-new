export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  run as runReport,
} from "@/lib/finance/reporting/runtime/ReportingApplicationService";
import {
  resolveReportRequestContext,
} from "@/lib/finance/reporting/runtime/resolveReportRequestContext";

function accessError(context) {
  return NextResponse.json(
    {
      success: false,
      error: context.error,
    },
    {
      status: context.status || 400,
    }
  );
}

async function execute(source) {
  const context = await resolveReportRequestContext(source);

  if (!context.success) {
    return accessError(context);
  }

  const result = await runReport("profit_loss", {
    organizationId: context.organizationId,
    entityId: context.entityId,
    periodId: context.periodId,
    startDate: context.startDate,
    endDate: context.endDate,
  });

  return NextResponse.json(result);
}

export async function GET(request) {
  try {
    return await execute(
      new URL(request.url).searchParams
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Profit and loss failed",
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    return await execute(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Profit and loss failed",
      },
      { status: 500 }
    );
  }
}
