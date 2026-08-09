import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { registerWorkflow } from "@/lib/orchestration/registerWorkflow";

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

    const workflow = await registerWorkflow({
      organizationId: access.organizationId,
      workflowName:
        body.workflowName || body.workflow_name,
      workflowType:
        body.workflowType || body.workflow_type,
      workflowDefinition:
        body.workflowDefinition || body.workflow_definition || {},
      triggerEvent:
        body.triggerEvent || body.trigger_event || null,
      createdBy: access.userId,
      active:
        body.active === undefined ? true : Boolean(body.active),
    });

    return NextResponse.json({
      success: true,
      workflow,
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
