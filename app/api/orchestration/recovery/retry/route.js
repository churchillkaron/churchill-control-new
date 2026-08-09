import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { retryFailedOrchestration } from "@/lib/orchestration/retryFailedOrchestration";

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

    const retried = await retryFailedOrchestration({
      organizationId: access.organizationId,
      limit: body.limit || 50,
    });

    return NextResponse.json({
      success: true,
      retried,
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
