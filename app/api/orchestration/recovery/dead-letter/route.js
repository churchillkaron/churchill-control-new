import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { moveToDeadLetterQueue } from "@/lib/orchestration/moveToDeadLetterQueue";

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

    const deadLetter = await moveToDeadLetterQueue({
      organizationId: access.organizationId,
      orchestrationType:
        body.orchestrationType || body.orchestration_type,
      referenceId:
        body.referenceId || body.reference_id || null,
      failedStep:
        body.failedStep || body.failed_step || null,
      errorMessage:
        body.errorMessage || body.error_message || null,
      payload: body.payload || {},
    });

    return NextResponse.json({
      success: true,
      deadLetter,
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
