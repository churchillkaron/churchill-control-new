import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
import {
  localDateString,
  resolveOrganizationTimeContext,
  scheduleWindow,
} from "@/lib/shared/time/organizationTime";

const DEFAULT_EARLY_START_MINUTES = 30;
const DEFAULT_LATE_THRESHOLD_MINUTES = 10;

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function minutesBetween(startValue, endValue) {
  if (!startValue || !endValue) return 0;

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  return Math.max(0, Math.round((end - start) / 60000));
}

async function loadWorkforceSettings(organizationId) {
  const settings = await loadOperationalSettings({
    organizationId,
    domain: "WORKFORCE",
  });

  return {
    earlyStartMinutes: numeric(
      settings?.early_clock_in_minutes,
      DEFAULT_EARLY_START_MINUTES
    ),
    lateThresholdMinutes: numeric(
      settings?.late_threshold_minutes,
      DEFAULT_LATE_THRESHOLD_MINUTES
    ),
  };
}

export async function loadTodaySchedule({
  organizationId,
  staffId,
  timezone,
  now = new Date(),
}) {
  if (!organizationId || !staffId) {
    throw new Error("organizationId and staffId required");
  }

  const shiftDate = localDateString(now, timezone || "UTC");

  const { data, error } = await supabaseAdmin
    .from("staff_schedules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("shift_date", shiftDate)
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function loadOpenShift({ organizationId, staffId }) {
  if (!organizationId || !staffId) {
    throw new Error("organizationId and staffId required");
  }

  const { data, error } = await supabaseAdmin
    .from("staff_shifts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function loadStaffWorkday({
  organizationId,
  staffId,
  entityId = null,
  now = new Date(),
}) {
  const timeContext = await resolveOrganizationTimeContext({
    organizationId,
    entityId,
  });

  const [schedule, openShift] = await Promise.all([
    loadTodaySchedule({
      organizationId,
      staffId,
      timezone: timeContext.timezone,
      now,
    }),
    loadOpenShift({
      organizationId,
      staffId,
    }),
  ]);

  return {
    timezone: timeContext.timezone,
    currency: timeContext.currency,
    businessDate: localDateString(now, timeContext.timezone),
    schedule,
    openShift,
  };
}

async function createAttendanceFromShift({
  organizationId,
  staff,
  schedule,
  shift,
  scheduleTiming,
  businessDate,
  lateMinutes,
}) {
  const { data, error } = await supabaseAdmin
    .from("staff_attendance")
    .insert({
      organization_id: organizationId,
      party_id: staff.party_id || null,
      staff_id: staff.id,
      staff_name: staff.name || staff.email || "Staff",
      shift_date: businessDate,
      schedule_id: schedule?.id || null,
      shift_id: shift.id,
      scheduled_start: scheduleTiming?.startIso || null,
      scheduled_end: scheduleTiming?.endIso || null,
      actual_start: shift.clock_in,
      late_minutes: lateMinutes,
      attendance_status: "PRESENT",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function clockInStaff({
  organizationId,
  staff,
  entityId = null,
  now = new Date(),
}) {
  if (!organizationId || !staff?.id) {
    throw new Error("organizationId and staff required");
  }

  const existingShift = await loadOpenShift({
    organizationId,
    staffId: staff.id,
  });

  if (existingShift) {
    const error = new Error("An active shift already exists");
    error.status = 409;
    throw error;
  }

  const timeContext = await resolveOrganizationTimeContext({
    organizationId,
    entityId,
  });

  const workforceSettings = await loadWorkforceSettings(organizationId);
  const businessDate = localDateString(now, timeContext.timezone);
  const schedule = await loadTodaySchedule({
    organizationId,
    staffId: staff.id,
    timezone: timeContext.timezone,
    now,
  });

  const scheduleTiming = schedule
    ? scheduleWindow({
        shiftDate: schedule.shift_date,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        timezone: timeContext.timezone,
      })
    : null;

  let lateMinutes = 0;
  let isLate = false;

  if (scheduleTiming?.start) {
    const earliestStart = new Date(
      scheduleTiming.start.getTime() -
        workforceSettings.earlyStartMinutes * 60000
    );

    if (now < earliestStart) {
      const error = new Error("Too early to start shift");
      error.status = 400;
      throw error;
    }

    lateMinutes = Math.max(
      0,
      Math.floor((now.getTime() - scheduleTiming.start.getTime()) / 60000)
    );

    isLate = lateMinutes > workforceSettings.lateThresholdMinutes;
  }

  const { data: shift, error: shiftError } = await supabaseAdmin
    .from("staff_shifts")
    .insert({
      organization_id: organizationId,
      party_id: staff.party_id || null,
      staff_id: staff.id,
      schedule_id: schedule?.id || null,
      staff_name: staff.name || staff.email || "Staff",
      staff_role: staff.role || staff.position || "STAFF",
      clock_in: now.toISOString(),
      is_valid: true,
      is_late: isLate,
      late_minutes: lateMinutes,
      penalty_multiplier: 1,
      scheduled_start: schedule?.start_time || null,
      scheduled_end: schedule?.end_time || null,
      shift_source: schedule ? "SCHEDULED" : "UNSCHEDULED",
      approval_status: schedule ? "APPROVED" : "PENDING",
      shift_status: "ACTIVE",
    })
    .select("*")
    .single();

  if (shiftError) throw shiftError;

  let attendance = null;

  try {
    attendance = await createAttendanceFromShift({
      organizationId,
      staff,
      schedule,
      shift,
      scheduleTiming,
      businessDate,
      lateMinutes,
    });
  } catch (attendanceError) {
    await supabaseAdmin
      .from("staff_shifts")
      .delete()
      .eq("id", shift.id)
      .eq("organization_id", organizationId)
      .eq("staff_id", staff.id);

    throw attendanceError;
  }

  return {
    timezone: timeContext.timezone,
    businessDate,
    schedule,
    shift,
    attendance,
    late: isLate,
    lateMinutes,
  };
}

export async function clockOutStaff({
  organizationId,
  staff,
  entityId = null,
  now = new Date(),
}) {
  if (!organizationId || !staff?.id) {
    throw new Error("organizationId and staff required");
  }

  const openShift = await loadOpenShift({
    organizationId,
    staffId: staff.id,
  });

  if (!openShift) {
    const error = new Error("No open shift found");
    error.status = 400;
    throw error;
  }

  const timeContext = await resolveOrganizationTimeContext({
    organizationId,
    entityId,
  });

  const workedMinutes = minutesBetween(openShift.clock_in, now.toISOString());

  let scheduledMinutes = null;

  if (openShift.schedule_id) {
    const { data: schedule, error: scheduleError } = await supabaseAdmin
      .from("staff_schedules")
      .select("*")
      .eq("id", openShift.schedule_id)
      .eq("organization_id", organizationId)
      .eq("staff_id", staff.id)
      .maybeSingle();

    if (scheduleError) throw scheduleError;

    const timing = schedule
      ? scheduleWindow({
          shiftDate: schedule.shift_date,
          startTime: schedule.start_time,
          endTime: schedule.end_time,
          timezone: timeContext.timezone,
        })
      : null;

    scheduledMinutes = timing?.durationMinutes ?? null;
  }

  const overtimeMinutes =
    Number.isFinite(scheduledMinutes) && scheduledMinutes > 0
      ? Math.max(0, workedMinutes - scheduledMinutes)
      : 0;

  const { data: shift, error: shiftError } = await supabaseAdmin
    .from("staff_shifts")
    .update({
      clock_out: now.toISOString(),
      worked_minutes: workedMinutes,
      overtime_minutes: overtimeMinutes,
      shift_status: "COMPLETED",
    })
    .eq("id", openShift.id)
    .eq("organization_id", organizationId)
    .eq("staff_id", staff.id)
    .select("*")
    .single();

  if (shiftError) throw shiftError;

  const { data: attendance, error: attendanceError } = await supabaseAdmin
    .from("staff_attendance")
    .update({
      actual_end: now.toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("staff_id", staff.id)
    .eq("shift_id", openShift.id)
    .select("*")
    .maybeSingle();

  if (attendanceError) throw attendanceError;

  return {
    timezone: timeContext.timezone,
    shift,
    attendance: attendance || null,
  };
}

export default loadStaffWorkday;
