import { NextResponse } from "next/server";

import { executeAccountingWorkflow } from "@/lib/finance/core/executeAccountingWorkflow";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const workflow =
      await executeAccountingWorkflow({
        tenantId:
          body.tenantId,
        workflowType:
          body.workflowType,
      });

    return NextResponse.json({
      success: true,
      workflow,
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
