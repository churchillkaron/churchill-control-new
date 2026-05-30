import { NextResponse } from "next/server";

import { registerWorkflow } from "@/lib/orchestration/registerWorkflow";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const workflow =
      await registerWorkflow({
        tenantId:
          body.tenantId,
        workflowName:
          body.workflowName,
        workflowType:
          body.workflowType,
        workflowDefinition:
          body.workflowDefinition,
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
