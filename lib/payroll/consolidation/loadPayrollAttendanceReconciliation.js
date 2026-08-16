import { loadEmploymentAssignmentsForPeriod } from "@/lib/people/employees/employmentAssignmentService";
import {
  applyEffectiveShiftCorrections,
  loadAttendanceCorrections,
} from "@/lib/people/workforce/attendanceCorrectionRuntime";
import { loadApprovedTimeOffForRange } from "@/lib/people/workforce/workforceRequestRuntime";
import { loadWorkforceCalendar } from "@/lib/people/workforce/workforceCalendarRuntime";
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

function monthEnd(payrollMonth) {
  const date = new Date(`${payrollMonth}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

async function resolvePayrollEntityId({ organizationId, entityId, staffId, payrollMonth }) {
  if (entityId) return entityId;

  const { data: payrollRows, error: payrollError } = await supabaseAdmin
    .from("payroll_records")
    .select("entity_id")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("payroll_month", payrollMonth)
    .not("entity_id", "is", null)
    .limit(10);
  if (payrollError) throw payrollError;

  const payrollEntityIds = [...new Set((payrollRows || []).map((row) => row.entity_id).filter(Boolean))];
  if (payrollEntityIds.length === 1) return payrollEntityIds[0];
  if (payrollEntityIds.length > 1) {
    throw new Error("Payroll attendance reconciliation has ambiguous legal-entity scope");
  }

  const range = monthRange(payrollMonth);
  const { data: compensationRows, error: compensationError } = await supabaseAdmin
    .from("employee_compensation_profiles")
    .select("entity_id")
    .eq("organization_id", organizationId)
    .eq("staff_account_id", staffId)
    .lte("effective_from", monthEnd(payrollMonth))
    .or(`effective_to.is.null,effective_to.gte.${range.start}`)
    .limit(10);
  if (compensationError) throw compensationError;

  const compensationEntityIds = [...new Set((compensationRows || []).map((row) => row.entity_id).filter(Boolean))];
  if (compensationEntityIds.length === 1) return compensationEntityIds[0];
  if (!compensationEntityIds.length) {
    throw new Error("Payroll legal entity could not be resolved for attendance reconciliation");
  }
  throw new Error("Compensation evidence spans multiple legal entities; entityId is required");
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

function validTimestamp(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function latestTimestamp(values = []) {
  let latest = null;

  for (const value of values) {
    const time = validTimestamp(value);
    if (time === null) continue;
    if (latest === null || time > latest) latest = time;
  }

  return latest === null ? null : new Date(latest).toISOString();
}

function approvedTimeOffForDate(rows, shiftDate) {
  return (
    rows.find(
      (row) =>
        row?.status === "APPROVED" &&
        row?.start_date <= shiftDate &&
        row?.end_date >= shiftDate
    ) || null
  );
}

export function isPayrollAttendanceSnapshotStale({
  reconciliation,
  calculatedAt,
}) {
  const latestInput = validTimestamp(reconciliation?.latestPayrollInputAt);
  const calculation = validTimestamp(calculatedAt);

  if (latestInput === null || calculation === null) return false;
  return latestInput > calculation;
}

export default async function loadPayrollAttendanceReconciliation({
  organizationId,
  entityId = null,
  staffId,
  payrollMonth,
  now = new Date(),
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!staffId) throw new Error("staffId required");
  if (!payrollMonth) throw new Error("payrollMonth required");

  const resolvedEntityId = await resolvePayrollEntityId({
    organizationId,
    entityId,
    staffId,
    payrollMonth,
  });
  const range = monthRange(payrollMonth);
  const payrollMonthEnd = monthEnd(payrollMonth);
  const [
    payrollSettings,
    timeContext,
    approvedTimeOff,
    calendarRows,
    employmentAssignments,
  ] = await Promise.all([
    loadOperationalSettings({
      organizationId,
      domain: "PAYROLL",
    }),
    resolveOrganizationTimeContext({ organizationId, entityId: resolvedEntityId }),
    loadApprovedTimeOffForRange({
      organizationId,
      staffId,
      startDate: range.start,
      endDate: range.end,
    }),
    loadWorkforceCalendar({
      organizationId,
      entityId: resolvedEntityId,
      startDate: range.start,
      endDate: range.end,
      includeCancelled: true,
    }),
    loadEmploymentAssignmentsForPeriod({
      organizationId,
      entityId: resolvedEntityId,
      staffId,
      startDate: range.start,
      endDate: payrollMonthEnd,
    }),
  ]);

  if (!employmentAssignments.length) {
    throw new Error("Payroll legal-employer assignment is missing for attendance reconciliation");
  }

  const fullPeriodAssignment = employmentAssignments.find(
    (assignment) =>
      assignment.effective_from <= range.start &&
      (!assignment.effective_to || assignment.effective_to >= payrollMonthEnd)
  );

  if (!fullPeriodAssignment) {
    throw new Error(
      "Payroll attendance reconciliation requires a full-month legal-employer assignment"
    );
  }

  const publicHolidayByDate = new Map(
    calendarRows
      .filter((row) => row.status === "ACTIVE" && row.day_type === "PUBLIC_HOLIDAY")
      .map((row) => [row.calendar_date, row])
  );

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
      .select("id,staff_id,shift_date,start_time,end_time,status,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .gte("shift_date", range.start)
      .lt("shift_date", range.end),
    supabaseAdmin
      .from("staff_shifts")
      .select("id,staff_id,schedule_id,clock_in,clock_out,shift_status,is_valid,approval_status,approved_at,created_at")
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .gte("clock_in", rangeStart.toISOString())
      .lt("clock_in", rangeEnd.toISOString()),
    supabaseAdmin
      .from("staff_attendance")
      .select("id,staff_id,schedule_id,shift_id,shift_date,attendance_status,approved_at,created_at")
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .gte("shift_date", range.start)
      .lt("shift_date", range.end),
  ]);

  for (const result of [scheduleResult, shiftResult, attendanceResult]) {
    if (result.error) throw result.error;
  }

  const scheduleRows = scheduleResult.data || [];
  const schedules = scheduleRows.filter(
    (schedule) => String(schedule?.status || "").toUpperCase() === "PUBLISHED"
  );
  const rawShifts = shiftResult.data || [];
  const rawAttendance = attendanceResult.data || [];
  const corrections = await loadAttendanceCorrections({
    organizationId,
    shiftIds: rawShifts.map((shift) => shift.id),
  });
  const effectiveRawShifts = applyEffectiveShiftCorrections({
    shifts: rawShifts,
    corrections,
  });
  const shifts = effectiveRawShifts.filter(payrollEligibleShift);
  const excludedShiftIds = new Set(
    effectiveRawShifts
      .filter((shift) => !payrollEligibleShift(shift))
      .map((shift) => shift.id)
      .filter(Boolean)
  );
  const attendance = rawAttendance.filter(
    (row) => !row.shift_id || !excludedShiftIds.has(row.shift_id)
  );

  const latestPayrollInputAt = latestTimestamp([
    ...employmentAssignments.flatMap((assignment) => [
      assignment.created_at,
      assignment.updated_at,
      assignment.ended_at,
    ]),
    ...scheduleRows.flatMap((schedule) => [schedule.created_at, schedule.updated_at]),
    ...rawShifts.flatMap((shift) => [
      shift.created_at,
      shift.approved_at,
      shift.clock_out,
    ]),
    ...rawAttendance.flatMap((row) => [row.created_at, row.approved_at]),
    ...corrections.flatMap((correction) => [
      correction.created_at,
      correction.approved_at,
    ]),
    ...approvedTimeOff.flatMap((request) => [
      request.created_at,
      request.updated_at,
      request.reviewed_at,
    ]),
    ...calendarRows.flatMap((day) => [
      day.created_at,
      day.updated_at,
      day.cancelled_at,
    ]),
  ]);

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
  const timeOffScheduleIds = [];
  const publicHolidayScheduleIds = [];

  for (const schedule of schedules) {
    if (directlyWorkedScheduleIds.has(schedule.id)) continue;

    const availableLegacyShift = legacyWorkedByDate.get(schedule.shift_date) || 0;
    if (availableLegacyShift > 0) {
      legacyWorkedByDate.set(schedule.shift_date, availableLegacyShift - 1);
      continue;
    }

    const attendanceRow = attendanceByScheduleId.get(schedule.id) || null;
    const approvedLeave = approvedTimeOffForDate(approvedTimeOff, schedule.shift_date);
    const attendanceClassification = attendanceStatus(attendanceRow);
    const publicHoliday = publicHolidayByDate.get(schedule.shift_date) || null;
    const status = approvedLeave
      ? String(approvedLeave.attendance_classification || "APPROVED_LEAVE").toUpperCase()
      : attendanceClassification || (publicHoliday ? "PUBLIC_HOLIDAY" : "");

    if (approvedLeave) timeOffScheduleIds.push(schedule.id);
    if (!approvedLeave && !attendanceClassification && publicHoliday) {
      publicHolidayScheduleIds.push(schedule.id);
    }

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
    entityId: resolvedEntityId,
    employmentAssignmentId: fullPeriodAssignment.id,
    missedShifts,
    creditedHours: Number(creditedHours.toFixed(2)),
    creditedSchedules,
    unresolvedSchedules: unresolvedScheduleIds.length,
    unresolvedScheduleIds,
    classificationCounts,
    correctionCount: corrections.length,
    approvedTimeOffCount: approvedTimeOff.length,
    timeOffScheduleIds,
    publicHolidayCount: publicHolidayByDate.size,
    publicHolidayScheduleIds,
    latestPayrollInputAt,
  };
}
