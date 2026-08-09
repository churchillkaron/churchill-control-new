import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { executeWorkflow } from "@/lib/orchestration/executeWorkflow";

export async function POST(request) {
  try {
    const body = await request.json();

    const access = await requireOrganizationAccess({
      organizationId:
        body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const execution = await executeWorkflow({
      organizationId: access.organizationId,
      workflowId:
        body.workflowId || body.workflow_id,
      executionReference:
        body.executionReference || body.execution_reference || null,
      inputPayload:
        body.inputPayload || body.input_payload || {},
      triggerSource:
        body.triggerSource || body.trigger_source || "API",
    });

    return NextResponse.json({
      success: true,
      execution,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: error.status || 400,
      }
    );
  }
}
