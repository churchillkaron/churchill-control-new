export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  runCashFlowCommand,
} from "@/lib/finance/reporting/runtime/ReportingApplicationService";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const cashFlow =
      await runCashFlowCommand({
        organizationId:
          body.organizationId,
      });

    return NextResponse.json({
      success: true,
      cashFlow,
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
