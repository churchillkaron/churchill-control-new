import { NextResponse } from "next/server";

import { runCashFlowEngine } from "@/lib/finance/reporting/runCashFlowEngine";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const cashFlow =
      await runCashFlowEngine({
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
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
