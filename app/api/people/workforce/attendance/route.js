export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  applyEffectiveShiftCorrections,
  createAttendanceCorrection,
  loadAttendanceCorrections,
} from "@/lib/people/workforce/attendanceCorrectionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  localDateString,
  resolveOrganizationTimeContext,
  scheduleWindow,
  zonedDateTimeToUtc,
} from "@/lib/shared/time/organizationTime";

const MANAGE_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "HR_ADMIN",
  "PAYROLL_ADMIN",
]);

function roleOf(value) {
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

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) {
    throw new Error("month must use YYYY-MM format");
  }

  const start = `${month}-01`;
  const end = new Date(`${start}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);

  return { start, end: end.toISOString().slice(0, 10) };
}

function mergeNotes(existing, note, managerName) {
  const clean = String(note || "").trim();
  if (!clean) return existing || null;

  const stamp = new Date().toISOString();
  const entry = `[${stamp}] ${managerName || "Manager"}: ${clean}`;
  return existing ? `${existing}\n${entry}` : entry;
}

function completedShift(shift) {
  return shift?.shift_status === "COMPLETED" || Boolean(shift?.clock_out);
}

function correctionEligibleShift(shift) {
  const approvalStatus = String(shift?.approval_status || "").toUpperCase();

  return (
    completedShift(shift) &&
    Boolean(shift?.clock_out) &&
    shift?.is_valid !== false &&
    approvalStatus !== "PENDING" &&
    approvalStatus !== "REJECTED"
  );
}

function staffDateKey(staffId, shiftDate) {
  return `${staffId || ""}:${shiftDate || ""}`;
}

async function loadMonthData({ organizationId, month, now = new Date() }) {
  const range = monthRange(month);
  const timeContext = await resolveOrganizationTimeContext({ organizationId });
  const rangeStart = zonedDateTimeToUtc({
    date: range.start,
    time: "00:00:00",
    timezone: timeContext.timezone,
  });
  const rangeEnd = zonedDateTimeToUtc({
    date: range.end,
    time: "00:00:00",
    timezone: timeContext.timezone,
  });

  const [staffResult, scheduleResult, shiftResult, attendanceResult] =
    await Promise.all([
      supabaseAdmin
        .from("staff_accounts")
        .select("id,name,email,role,position,department,party_id,active")
        .eq("active_organization_id", organizationId)
        .eq("active", true)
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("staff_schedules")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "PUBLISHED")
        .gte("shift_date", range.start)
        .lt("shift_date", range.end)
        .order("shift_date", { ascending: true })
        .order("start_time", { ascending: true }),
      supabaseAdmin
        .from("staff_shifts")
        .select("*")
        .eq("organization_id", organizationId)
        .gte("clock_in", rangeStart.toISOString())
        .lt("clock_in", rangeEnd.toISOString())
        .order("clock_in", { ascending: false }),
      supabaseAdmin
        .from("staff_attendance")
        .select("*")
        .eq("organization_id", organizationId)
        .gte("shift_date", range.start)
        .lt("shift_date", range.end)
        .order("shift_date", { ascending: false }),
    ]);

  for (const result of [staffResult, scheduleResult, shiftResult, attendanceResult]) {
    if (result.error) throw result.error;
  }

  const schedules = scheduleResult.data || [];
  const rawShifts = shiftResult.data || [];
  const attendance = attendanceResult.data || [];
  const attendanceCorrections = await loadAttendanceCorrections({
    organizationId,
    shiftIds: rawShifts.map((shift) => shift.id),
  });
  const shifts = applyEffectiveShiftCorrections({
    shifts: rawShifts,
    corrections: attendanceCorrections,
  });

  const workedScheduleIds = new Set(
    shifts
      .filter(completedShift)
      .map((shift) => shift.schedule_id)
      .filter(Boolean)
  );
  const attendanceScheduleIds = new Set(
    attendance.map((row) => row.schedule_id).filter(Boolean)
  );
  const legacyWorkedCounts = new Map();

  for (const shift of shifts) {
    if (!completedShift(shift) || shift.schedule_id || !shift.clock_in) continue;

    const shiftDate = localDateString(
      new Date(shift.clock_in),
      timeContext.timezone
    );
    const key = staffDateKey(shift.staff_id, shiftDate);
    legacyWorkedCounts.set(key, (legacyWorkedCounts.get(key) || 0) + 1);
  }

  const absenceCandidates = [];
  for (const schedule of schedules) {
    if (workedScheduleIds.has(schedule.id) || attendanceScheduleIds.has(schedule.id)) {
      continue;
    }

    const legacyKey = staffDateKey(schedule.staff_id, schedule.shift_date);
    const legacyCount = legacyWorkedCounts.get(legacyKey) || 0;
    if (legacyCount > 0) {
      legacyWorkedCounts.set(legacyKey, legacyCount - 1);
      continue;
    }

    const timing = scheduleWindow({
      shiftDate: schedule.shift_date,
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      timezone: timeContext.timezone,
    });

    if (timing?.end && now > timing.end) {
      absenceCandidates.push(schedule);
    }
  }

  return {
    timezone: timeContext.timezone,
    businessDate: localDateString(now, timeContext.timezone),
    staff: staffResult.data || [],
    schedules,
    shifts,
    attendance,
    attendanceCorrections,
    correctableShifts: shifts.filter(correctionEligibleShift),
    pendingShifts: shifts.filter(
      (shift) => String(shift.approval_status || "").toUpperCase() === "PENDING"
    ),
    lateShifts: shifts.filter(
      (shift) =>
        String(shift.approval_status || "").toUpperCase() !== "REJECTED" &&
        shift.is_valid !== false &&
        shift.is_late === true
    ),
    absenceCandidates,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const requestedOrganizationId = url.searchParams.get("organizationId") || null;
    const ctx = await managementContext(request, requestedOrganizationId);
    if (ctx.response) return ctx.response;

    const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const data = await loadMonthData({
      organizationId: ctx.organizationId,
      month,
    });

    return NextResponse.json({
      success: true,
      organizationId: ctx.organizationId,
      role: ctx.role,
      month,
      ...data,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load attendance" },
      { status: 400 }
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

    const action = String(body?.action || "").trim().toLowerCase();
    const managerName = ctx.manager?.name || ctx.manager?.email || "Manager";

    if (action === "review_shift") {
      const shiftId = String(body?.shiftId || "").trim();
      const decision = String(body?.decision || "").trim().toUpperCase();
      if (!shiftId || !["APPROVED", "REJECTED"].includes(decision)) {
        return NextResponse.json(
          { success: false, error: "shiftId and APPROVED/REJECTED decision required" },
          { status: 400 }
        );
      }

      const { data: shift, error: shiftError } = await supabaseAdmin
        .from("staff_shifts")
        .select("*")
        .eq("id", shiftId)
        .eq("organization_id", ctx.organizationId)
        .maybeSingle();
      if (shiftError) throw shiftError;
      if (!shift) {
        return NextResponse.json(
          { success: false, error: "Shift not found in organization" },
          { status: 404 }
        );
      }

      const { data: updatedShift, error: updateError } = await supabaseAdmin
        .from("staff_shifts")
        .update({
          approval_status: decision,
          is_valid: decision === "APPROVED",
          approved_by: ctx.manager?.id || null,
          approved_at: new Date().toISOString(),
          replacement_reason: mergeNotes(
            shift.replacement_reason,
            body?.notes || `${decision === "APPROVED" ? "Approved" : "Rejected"} by attendance manager`,
            managerName
          ),
        })
        .eq("id", shiftId)
        .eq("organization_id", ctx.organizationId)
        .select("*")
        .single();
      if (updateError) throw updateError;

      const { data: attendance, error: attendanceLoadError } = await supabaseAdmin
        .from("staff_attendance")
        .select("*")
        .eq("organization_id", ctx.organizationId)
        .eq("shift_id", shiftId)
        .maybeSingle();
      if (attendanceLoadError) throw attendanceLoadError;

      if (attendance) {
        const { error: attendanceUpdateError } = await supabaseAdmin
          .from("staff_attendance")
          .update({
            approved_by: String(ctx.manager?.id || managerName),
            approved_at: new Date().toISOString(),
            notes: mergeNotes(
              attendance.notes,
              body?.notes || `Shift ${decision.toLowerCase()}`,
              managerName
            ),
          })
          .eq("id", attendance.id)
          .eq("organization_id", ctx.organizationId);
        if (attendanceUpdateError) throw attendanceUpdateError;
      }

      return NextResponse.json({ success: true, shift: updatedShift });
    }

    if (action === "correct_shift_time") {
      const shiftId = String(body?.shiftId || "").trim();
      const correctedClockInLocal = String(
        body?.correctedClockInLocal || ""
      ).trim();
      const correctedClockOutLocal = String(
        body?.correctedClockOutLocal || ""
      ).trim();
      const reason = String(body?.reason || body?.notes || "").trim();

      if (!shiftId || !correctedClockInLocal || !correctedClockOutLocal || !reason) {
        return NextResponse.json(
          {
            success: false,
            error:
              "shiftId, correctedClockInLocal, correctedClockOutLocal and correction reason required",
          },
          { status: 400 }
        );
      }

      const result = await createAttendanceCorrection({
        organizationId: ctx.organizationId,
        shiftId,
        manager: ctx.manager,
        correctedClockInLocal,
        correctedClockOutLocal,
        reason,
      });

      return NextResponse.json({ success: true, ...result });
    }

    if (action === "adjust_lateness") {
      return NextResponse.json(
        {
          success: false,
          code: "ATTENDANCE_CORRECTION_REQUIRED",
          error:
            "Raw lateness evidence is immutable. Correct the effective shift time with a manager reason instead.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Unsupported attendance action" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to update attendance",
        ...(error?.code ? { code: error.code } : {}),
      },
      { status: error?.status || 400 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId =
      String(body?.organizationId || body?.organization_id || "").trim() || null;
    const ctx = await managementContext(request, requestedOrganizationId);
    if (ctx.response) return ctx.response;

    const action = String(body?.action || "").trim().toLowerCase();
    if (action !== "mark_absent") {
      return NextResponse.json(
        { success: false, error: "Unsupported attendance action" },
        { status: 400 }
      );
    }

    const scheduleId = String(body?.scheduleId || "").trim();
    const note = String(body?.notes || "").trim();
    if (!scheduleId || !note) {
      return NextResponse.json(
        { success: false, error: "scheduleId and absence notes required" },
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

    const { data: existingAttendance, error: existingAttendanceError } =
      await supabaseAdmin
        .from("staff_attendance")
        .select("id")
        .eq("organization_id", ctx.organizationId)
        .eq("schedule_id", scheduleId)
        .limit(1)
        .maybeSingle();
    if (existingAttendanceError) throw existingAttendanceError;
    if (existingAttendance) {
      return NextResponse.json(
        { success: false, error: "Attendance already exists for this schedule" },
        { status: 409 }
      );
    }

    const { data: existingShift, error: existingShiftError } = await supabaseAdmin
      .from("staff_shifts")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("schedule_id", scheduleId)
      .limit(1)
      .maybeSingle();
    if (existingShiftError) throw existingShiftError;
    if (existingShift) {
      return NextResponse.json(
        { success: false, error: "Shift evidence exists for this schedule" },
        { status: 409 }
      );
    }

    const timeContext = await resolveOrganizationTimeContext({
      organizationId: ctx.organizationId,
    });
    const timing = scheduleWindow({
      shiftDate: schedule.shift_date,
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      timezone: timeContext.timezone,
    });
    if (!timing?.end || new Date() <= timing.end) {
      return NextResponse.json(
        { success: false, error: "Absence can only be confirmed after the scheduled shift ends" },
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
        attendance_status: "ABSENT",
        approved_by: String(ctx.manager?.id || managerName),
        approved_at: new Date().toISOString(),
        notes: mergeNotes(null, note, managerName),
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    return NextResponse.json({ success: true, attendance });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to record absence" },
      { status: error?.status || 400 }
    );
  }
}
