export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { loadStaffWorkday } from "@/lib/people/workforce/shiftRuntime";
import {
  executeAssignedWorkForStaff,
  listAssignedWorkForStaff,
} from "@/lib/operations/workforce/StaffAssignedWorkRuntime";

function errorResponse(error, fallback = "Unable to update My Day") {
  return staffApiErrorResponse(error, fallback);
}

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
          availableOrganizationIds:
            context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
      );
    }

    const workday = await loadStaffWorkday({
      organizationId: context.organizationId,
      staffId: context.staff.id,
    });

    const myDay = await listAssignedWorkForStaff({
      organizationId: context.organizationId,
      staffId: context.staff.id,
      timezone: workday.timezone,
    });

    return NextResponse.json({
      success: true,
      shiftActive: Boolean(workday.openShift),
      ...myDay,
    });
  } catch (error) {
    console.error("STAFF_MY_DAY_GET_ERROR", error);
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const context = await resolveAuthenticatedStaffContext({ request });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
        },
        { status: context.status || 403 }
      );
    }

    const workday = await loadStaffWorkday({
      organizationId: context.organizationId,
      staffId: context.staff.id,
    });

    if (!workday.openShift) {
      return NextResponse.json(
        {
          success: false,
          error: "Start your shift before starting or completing assigned work.",
        },
        { status: 409 }
      );
    }

    await executeAssignedWorkForStaff({
      organizationId: context.organizationId,
      staffId: context.staff.id,
      actorId: context.user.id,
      workOrderId: body.workOrderId || body.work_order_id,
      action: body.action,
      location: body.location,
      completion: body.completion || null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("STAFF_MY_DAY_POST_ERROR", error);
    return errorResponse(error);
  }
}
