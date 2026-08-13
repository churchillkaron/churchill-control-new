import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
import {
  localDateString,
  resolveOrganizationTimeContext,
  scheduleWindow,
  zonedDateTimeToUtc,
} from "@/lib/shared/time/organizationTime";

const ATTENDANCE_CREDIT_POLICY = {
  APPROVED_LEAVE: "approved_leave_counts_as_worked",
  SICK_LEAVE: "sick_leave_counts_as_worked",
  PUBLIC_HOLIDAY: "public_holiday_counts_as_worked",
  TRAINING: "training_counts_as_worked",
};

const CLASSIFIED_ATTENDANCE_STATUSES = new Set([
  "ABSENT",
  ...Object.keys(ATTENDANCE_CREDIT_POLICY),
]);

function monthRange(payrollMonth) {
  if (!/^\d{4}-\d{2}$/.test(String(payrollMonth || ""))) {
    throw new Error("payrollMonth must use YYYY-MM format");
  }

  const start = `${payrollMonth}-01`;
  const end = new Date(`${start}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);

  return {
    start,
    end: end.toISOString().slice(0, 10),
  };
}

function payrollEligibleShift(shift) {
  const approvalStatus = String(shift?.approval_status || "").toUpperCase();

  if (shift?.is_valid === false) return false;
  if (approvalStatus === "REJECTED" || approvalStatus === "PENDING") return false;

  return true;
}

function attendanceStatus(row) {
  return String(row?.attendance_status || "").trim().toUpperCase();
}

function scheduleHours(schedule, timezone) {
  const timing = scheduleWindow({
    shiftDate: schedule?.shift_date,
    startTime: schedule?.start_time,
    endTime: schedule?.end_time,
    timezone,
  });

  return timing ? timing.durationMinutes / 60 : 0;
}

function scheduleExpired(schedule, timezone, now) {
  const timing = scheduleWindow({
    shiftDate: schedule?.shift_date,
    startTime: schedule?.start_time,
    endTime: schedule?.end_time,
    timezone,
  });

  return Boolean(timing?.end && now > timing.end);
}

export default async function loadPayrollAttendanceReconciliation({
  organizationId,
  staffId,
  payrollMonth,
  now = new Date(),
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!staffId) throw new Error("staffId required");
  if (!payrollMonth) throw new Error("payrollMonth required");

  const range = monthRange(payrollMonth);
  const [payrollSettings, timeContext] = await Promise.all([
    loadOperationalSettings({
      organizationId,
      domain: "PAYROLL",
    }),
    resolveOrganizationTimeContext({ organizationId }),
  ]);

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

  const [scheduleResult, shiftResult, attendanceResult] = await Promise.all([
    supabaseAdmin
      .from("staff_schedules")
      .select("id,staff_id,shift_date,start_time,end_time,status")
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .eq("status", "PUBLISHED")
      .gte("shift_date", range.start)
      .lt("shift_date", range.end),
    supabaseAdmin
      .from("staff_shifts")
      .select("id,staff_id,schedule_id,clock_in,clock_out,shift_status,is_valid,approval_status")
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .gte("clock_in", rangeStart.toISOString())
      .lt("clock_in", rangeEnd.toISOString()),
    supabaseAdmin
      .from("staff_attendance")
      .select("id,staff_id,schedule_id,shift_id,shift_date,attendance_status")
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .gte("shift_date", range.start)
      .lt("shift_date", range.end),
  ]);

  for (const result of [scheduleResult, shiftResult, attendanceResult]) {
    if (result.error) throw result.error;
  }

  const schedules = scheduleResult.data || [];
  const shifts = (shiftResult.data || []).filter(payrollEligibleShift);
  const excludedShiftIds = new Set(
    (shiftResult.data || [])
      .filter((shift) => !payrollEligibleShift(shift))
      .map((shift) => shift.id)
      .filter(Boolean)
  );
  const attendance = (attendanceResult.data || []).filter(
    (row) => !row.shift_id || !excludedShiftIds.has(row.shift_id)
  );

  const completedShifts = shifts.filter(
    (shift) => shift.shift_status === "COMPLETED" || Boolean(shift.clock_out)
  );
  const directlyWorkedScheduleIds = new Set(
    completedShifts.map((shift) => shift.schedule_id).filter(Boolean)
  );
  const attendanceByScheduleId = new Map(
    attendance
      .filter((row) => row?.schedule_id)
      .map((row) => [row.schedule_id, row])
  );
  const legacyWorkedByDate = new Map();

  for (const shift of completedShifts) {
    if (shift.schedule_id || !shift.clock_in) continue;

    const date = localDateString(new Date(shift.clock_in), timeContext.timezone);
    legacyWorkedByDate.set(date, (legacyWorkedByDate.get(date) || 0) + 1);
  }

  let missedShifts = 0;
  let creditedHours = 0;
  let creditedSchedules = 0;
  const unresolvedScheduleIds = [];
  const classificationCounts = {};

  for (const schedule of schedules) {
    if (directlyWorkedScheduleIds.has(schedule.id)) continue;

    const availableLegacyShift = legacyWorkedByDate.get(schedule.shift_date) || 0;
    if (availableLegacyShift > 0) {
      legacyWorkedByDate.set(schedule.shift_date, availableLegacyShift - 1);
      continue;
    }

    const attendanceRow = attendanceByScheduleId.get(schedule.id) || null;
    const status = attendanceStatus(attendanceRow);

    if (CLASSIFIED_ATTENDANCE_STATUSES.has(status)) {
      classificationCounts[status] = (classificationCounts[status] || 0) + 1;

      if (status === "ABSENT") {
        missedShifts += 1;
        continue;
      }

      const policyKey = ATTENDANCE_CREDIT_POLICY[status];
      if (policyKey && payrollSettings?.[policyKey] === true) {
        creditedHours += scheduleHours(schedule, timeContext.timezone);
        creditedSchedules += 1;
      }
      continue;
    }

    if (scheduleExpired(schedule, timeContext.timezone, now)) {
      unresolvedScheduleIds.push(schedule.id);
    }
  }

  return {
    timezone: timeContext.timezone,
    missedShifts,
    creditedHours: Number(creditedHours.toFixed(2)),
    creditedSchedules,
    unresolvedSchedules: unresolvedScheduleIds.length,
    unresolvedScheduleIds,
    classificationCounts,
  };
}
