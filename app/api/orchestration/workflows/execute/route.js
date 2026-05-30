import { NextResponse } from "next/server";

import { executeWorkflow } from "@/lib/orchestration/executeWorkflow";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const execution =
      await executeWorkflow({
        tenantId:
          body.tenantId,
        workflowId:
          body.workflowId,
        executionReference:
          body.executionReference,
      });

    return NextResponse.json({
      success: true,
      execution,
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
