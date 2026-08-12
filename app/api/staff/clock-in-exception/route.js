export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  loadClockInExceptionState,
  requestClockInException,
} from "@/lib/people/workforce/clockInExceptionApproval";

function contextError(context) {
  return NextResponse.json(
    {
      success: false,
      error: context.error,
      code: context.code,
      availableOrganizationIds: context.availableOrganizationIds || [],
    },
    { status: context.status || 403 }
  );
}

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) return contextError(context);

    const state = await loadClockInExceptionState({
      organizationId: context.organizationId,
      staffId: context.staff.id,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      state,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load clock-in exception state",
        code: error?.code || null,
      },
      { status: error?.status || 500 }
    );
  }
}

export async function POST(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) return contextError(context);

    const body = await request.json();
    const result = await requestClockInException({
      organizationId: context.organizationId,
      staff: context.staff,
      reason: body?.reason,
      targets: body?.targets,
      failureCode: body?.failureCode || null,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to request clock-in exception",
        code: error?.code || null,
      },
      { status: error?.status || 500 }
    );
  }
}
