export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveOrganizationTimeContext,
  scheduleWindow,
} from "@/lib/shared/time/organizationTime";

const MANAGE_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "HR_ADMIN",
  "PAYROLL_ADMIN",
]);

const ATTENDANCE_CLASSIFICATIONS = new Set([
  "ABSENT",
  "APPROVED_LEAVE",
  "SICK_LEAVE",
  "PUBLIC_HOLIDAY",
  "TRAINING",
]);

function roleOf(value) {
  return String(value || "").trim().toUpperCase();
}

function classificationOf(value) {
  return String(value || "").trim().toUpperCase();
}

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

async function managementContext(request, requestedOrganizationId = null) {
  const context = await resolveAuthenticatedStaffContext({
    request,
    organizationId: requestedOrganizationId || null,
  });

  if (!context.success) return { response: contextError(context) };

  const role = roleOf(context.role || context.staff?.role);
  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Attendance management permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    organizationId: context.organizationId,
    manager: context.staff,
    role,
  };
}

function mergeNotes(existing, note, managerName) {
  const clean = String(note || "").trim();
  const stamp = new Date().toISOString();
  const entry = `[${stamp}] ${managerName || "Manager"}: ${clean}`;
  return existing ? `${existing}\n${entry}` : entry;
}

function validateClassification(value) {
  const classification = classificationOf(value);
  if (!ATTENDANCE_CLASSIFICATIONS.has(classification)) {
    throw new Error(
      "Attendance classification must be ABSENT, APPROVED_LEAVE, SICK_LEAVE, PUBLIC_HOLIDAY, or TRAINING"
    );
  }
  return classification;
}

function validateNotes(value) {
  const notes = String(value || "").trim();
  if (notes.length < 3) {
    throw new Error("Manager notes of at least 3 characters are required");
  }
  if (notes.length > 1000) {
    throw new Error("Manager notes must be 1000 characters or fewer");
  }
  return notes;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId =
      String(body?.organizationId || body?.organization_id || "").trim() || null;
    const ctx = await managementContext(request, requestedOrganizationId);
    if (ctx.response) return ctx.response;

    const scheduleId = String(body?.scheduleId || "").trim();
    const classification = validateClassification(body?.classification);
    const notes = validateNotes(body?.notes);

    if (!scheduleId) {
      return NextResponse.json(
        { success: false, error: "scheduleId required" },
        { status: 400 }
      );
    }

    const { data: schedule, error: scheduleError } = await supabaseAdmin
      .from("staff_schedules")
      .select("*")
      .eq("id", scheduleId)
      .eq("organization_id", ctx.organizationId)
      .eq("status", "PUBLISHED")
      .maybeSingle();
    if (scheduleError) throw scheduleError;
    if (!schedule) {
      return NextResponse.json(
        { success: false, error: "Published schedule not found in organization" },
        { status: 404 }
      );
    }

    const [existingAttendanceResult, existingShiftResult, timeContext] =
      await Promise.all([
        supabaseAdmin
          .from("staff_attendance")
          .select("id")
          .eq("organization_id", ctx.organizationId)
          .eq("schedule_id", scheduleId)
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from("staff_shifts")
          .select("id")
          .eq("organization_id", ctx.organizationId)
          .eq("schedule_id", scheduleId)
          .limit(1)
          .maybeSingle(),
        resolveOrganizationTimeContext({ organizationId: ctx.organizationId }),
      ]);

    if (existingAttendanceResult.error) throw existingAttendanceResult.error;
    if (existingShiftResult.error) throw existingShiftResult.error;
    if (existingAttendanceResult.data) {
      return NextResponse.json(
        { success: false, error: "Attendance already exists for this schedule" },
        { status: 409 }
      );
    }
    if (existingShiftResult.data) {
      return NextResponse.json(
        { success: false, error: "Shift evidence exists for this schedule" },
        { status: 409 }
      );
    }

    const timing = scheduleWindow({
      shiftDate: schedule.shift_date,
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      timezone: timeContext.timezone,
    });

    if (!timing?.end || new Date() <= timing.end) {
      return NextResponse.json(
        {
          success: false,
          error: "Attendance can only be classified after the scheduled shift ends",
        },
        { status: 400 }
      );
    }

    const managerName = ctx.manager?.name || ctx.manager?.email || "Manager";
    const { data: attendance, error: insertError } = await supabaseAdmin
      .from("staff_attendance")
      .insert({
        organization_id: ctx.organizationId,
        party_id: schedule.party_id || null,
        staff_id: schedule.staff_id,
        staff_name: schedule.staff_name || "Staff",
        shift_date: schedule.shift_date,
        schedule_id: schedule.id,
        shift_id: null,
        scheduled_start: timing.startIso,
        scheduled_end: timing.endIso,
        actual_start: null,
        actual_end: null,
        late_minutes: 0,
        attendance_status: classification,
        approved_by: String(ctx.manager?.id || managerName),
        approved_at: new Date().toISOString(),
        notes: mergeNotes(
          null,
          `${classification.replaceAll("_", " ")}: ${notes}`,
          managerName
        ),
      })
      .select("*")
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      attendance,
      classification,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to classify attendance",
      },
      { status: error?.status || 400 }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId =
      String(body?.organizationId || body?.organization_id || "").trim() || null;
    const ctx = await managementContext(request, requestedOrganizationId);
    if (ctx.response) return ctx.response;

    const attendanceId = String(body?.attendanceId || "").trim();
    const classification = validateClassification(body?.classification);
    const notes = validateNotes(body?.notes);

    if (!attendanceId) {
      return NextResponse.json(
        { success: false, error: "attendanceId required" },
        { status: 400 }
      );
    }

    const { data: attendance, error: attendanceError } = await supabaseAdmin
      .from("staff_attendance")
      .select("*")
      .eq("id", attendanceId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (attendanceError) throw attendanceError;
    if (!attendance) {
      return NextResponse.json(
        { success: false, error: "Attendance record not found in organization" },
        { status: 404 }
      );
    }

    const currentClassification = classificationOf(attendance.attendance_status);
    if (
      !ATTENDANCE_CLASSIFICATIONS.has(currentClassification) ||
      attendance.shift_id ||
      attendance.actual_start ||
      attendance.actual_end
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Worked attendance evidence cannot be reclassified as an absence outcome",
        },
        { status: 409 }
      );
    }

    const managerName = ctx.manager?.name || ctx.manager?.email || "Manager";
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("staff_attendance")
      .update({
        attendance_status: classification,
        approved_by: String(ctx.manager?.id || managerName),
        approved_at: new Date().toISOString(),
        notes: mergeNotes(
          attendance.notes,
          `${currentClassification} -> ${classification}: ${notes}`,
          managerName
        ),
      })
      .eq("id", attendanceId)
      .eq("organization_id", ctx.organizationId)
      .select("*")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      attendance: updated,
      classification,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to reclassify attendance",
      },
      { status: error?.status || 400 }
    );
  }
}
