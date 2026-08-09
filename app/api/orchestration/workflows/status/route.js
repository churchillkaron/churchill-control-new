import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { getWorkflowStatus } from "@/lib/orchestration/getWorkflowStatus";

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

    const status = await getWorkflowStatus({
      organizationId: access.organizationId,
      executionId:
        body.executionId || body.execution_id,
    });

    return NextResponse.json({
      success: true,
      status,
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
