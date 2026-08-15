export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  cancelShiftSwapRequest,
  cancelTimeOffRequest,
  createShiftSwapRequest,
  createTimeOffRequest,
  loadStaffWorkforceRequests,
  respondToShiftSwapRequest,
} from "@/lib/people/workforce/workforceRequestRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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

    const [requests, coworkersResult] = await Promise.all([
      loadStaffWorkforceRequests({
        organizationId: context.organizationId,
        staffId: context.staff.id,
      }),
      supabaseAdmin
        .from("staff_accounts")
        .select("id,name,email,role,position,department")
        .eq("active_organization_id", context.organizationId)
        .eq("active", true)
        .neq("id", context.staff.id)
        .order("name", { ascending: true }),
    ]);

    if (coworkersResult.error) throw coworkersResult.error;

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      staffId: context.staff.id,
      coworkers: coworkersResult.data || [],
      ...requests,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load workforce requests",
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
    const action = String(body?.action || "").trim().toLowerCase();
    let result;

    if (action === "request_time_off") {
      result = await createTimeOffRequest({
        organizationId: context.organizationId,
        staff: context.staff,
        leaveType: body?.leaveType,
        attendanceClassification: body?.attendanceClassification,
        startDate: body?.startDate,
        endDate: body?.endDate,
        reason: body?.reason,
      });
    } else if (action === "request_shift_swap") {
      result = await createShiftSwapRequest({
        organizationId: context.organizationId,
        staff: context.staff,
        scheduleId: body?.scheduleId,
        targetStaffId: body?.targetStaffId,
        reason: body?.reason,
      });
    } else if (action === "respond_shift_swap") {
      result = await respondToShiftSwapRequest({
        organizationId: context.organizationId,
        staffId: context.staff.id,
        requestId: body?.requestId,
        decision: body?.decision,
        notes: body?.notes,
      });
    } else if (action === "cancel_time_off") {
      result = await cancelTimeOffRequest({
        organizationId: context.organizationId,
        staffId: context.staff.id,
        requestId: body?.requestId,
      });
    } else if (action === "cancel_shift_swap") {
      result = await cancelShiftSwapRequest({
        organizationId: context.organizationId,
        staffId: context.staff.id,
        requestId: body?.requestId,
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Unsupported workforce request action" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to update workforce request",
        code: error?.code || null,
      },
      { status: error?.status || 500 }
    );
  }
}
