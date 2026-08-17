export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { loadStaffWorkday } from "@/lib/people/workforce/shiftRuntime";
import {
  executeAssignedWorkForStaff,
  listAssignedWorkForStaff,
} from "@/lib/operations/workforce/StaffAssignedWorkRuntime";
import {
  completeExecutionForStaff,
  getOrCreateExecutionReportForStaff,
} from "@/lib/service-management/runtime/ServiceExecutionRuntime";

function errorResponse(error) {
  return NextResponse.json(
    {
      success: false,
      error: error?.message || "Unable to update My Day",
      validationErrors: error?.validationErrors || [],
    },
    { status: error?.status || 500 }
  );
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
      identity: {
        organizationId: context.organizationId,
        staffId: context.staff.id,
        partyId: context.staff.party_id || null,
        name: context.staff.name || null,
      },
      staff: context.staff,
      shiftActive: Boolean(workday.openShift),
      activeShift: workday.openShift || null,
      schedule: workday.schedule || null,
      timezone: workday.timezone,
      businessDate: workday.businessDate,
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

    const workOrderId = body.workOrderId || body.work_order_id;
    const action = String(body.action || "").trim().toLowerCase();

    if (action === "complete") {
      const result = await completeExecutionForStaff({
        organizationId: context.organizationId,
        staffId: context.staff.id,
        actorId: context.user.id,
        workOrderId,
        completionGps: body.location || {},
        input: body,
      });

      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    const result = await executeAssignedWorkForStaff({
      organizationId: context.organizationId,
      staffId: context.staff.id,
      actorId: context.user.id,
      workOrderId,
      action,
      location: body.location,
    });

    let executionReport = null;
    if (action === "start") {
      const execution = await getOrCreateExecutionReportForStaff({
        organizationId: context.organizationId,
        staffId: context.staff.id,
        workOrderId,
        startGps: result.gps || body.location || {},
      });
      executionReport = execution.report;
    }

    return NextResponse.json({
      success: true,
      ...result,
      executionReport,
    });
  } catch (error) {
    console.error("STAFF_MY_DAY_POST_ERROR", error);
    return errorResponse(error);
  }
}
