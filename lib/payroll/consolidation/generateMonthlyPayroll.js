import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import calculateDailyPayouts from "@/lib/payroll/serviceCharge/calculateDailyPayouts";
import {
  buildPayrollRecords,
  persistPayrollRecords,
} from "@/lib/payroll/generatePayrollRecords";
import { calculateAttendanceScore } from "@/lib/people/employees/calculateAttendanceScore";
import { loadEmploymentCohort } from "@/lib/people/employees/employmentAssignmentService";
import {
  applyEffectiveShiftCorrections,
  loadAttendanceCorrections,
} from "@/lib/people/workforce/attendanceCorrectionRuntime";
import { loadApprovedTimeOffForRange } from "@/lib/people/workforce/workforceRequestRuntime";
import { loadWorkforceCalendar } from "@/lib/people/workforce/workforceCalendarRuntime";
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
  const start = `${payrollMonth}-01`;
  const end = new Date(`${start}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end: end.toISOString().slice(0, 10) };
}

function monthEnd(payrollMonth) {
  const date = new Date(`${payrollMonth}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function hoursBetween(startValue, endValue) {
  if (!startValue || !endValue) return 0;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, (end - start) / 3600000);
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

function fallbackExpectedHours(payrollMonth, settings) {
  const start = new Date(`${payrollMonth}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const daysInMonth = Math.round((end - start) / 86400000);
  const workingDaysPerWeek = Number(settings?.default_working_days_per_week || 0);
  const hoursPerShift = Number(settings?.default_hours_per_shift || 0);
  if (!workingDaysPerWeek || !hoursPerShift) return 0;
  return Number((daysInMonth * (workingDaysPerWeek / 7) * hoursPerShift).toFixed(2));
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

function scheduleExpired(schedule, timezone, now) {
  const timing = scheduleWindow({
    shiftDate: schedule?.shift_date,
    startTime: schedule?.start_time,
    endTime: schedule?.end_time,
    timezone,
  });
  return Boolean(timing?.end && now > timing.end);
}

function approvedTimeOffForDate(rows, shiftDate) {
  return (
    (rows || []).find(
      (row) =>
        row?.status === "APPROVED" &&
        row?.start_date <= shiftDate &&
        row?.end_date >= shiftDate
    ) || null
  );
}

function reconcileScheduledAttendance({
  schedules,
  shifts,
  attendance,
  approvedTimeOff = [],
  publicHolidayByDate = new Map(),
  timezone,
  payrollSettings,
  now = new Date(),
}) {
  const completedShifts = shifts.filter(
    (shift) => shift.shift_status === "COMPLETED" || Boolean(shift.clock_out)
  );
  const directlyWorkedScheduleIds = new Set(
    completedShifts.map((shift) => shift.schedule_id).filter(Boolean)
  );
  const attendanceByScheduleId = new Map(
    attendance.filter((row) => row?.schedule_id).map((row) => [row.schedule_id, row])
  );
  const legacyWorkedByDate = new Map();

  for (const shift of completedShifts) {
    if (shift.schedule_id || !shift.clock_in) continue;
    const date = localDateString(new Date(shift.clock_in), timezone);
    legacyWorkedByDate.set(date, (legacyWorkedByDate.get(date) || 0) + 1);
  }

  let missedShifts = 0;
  let creditedHours = 0;
  let creditedSchedules = 0;
  let unresolvedSchedules = 0;
  const classificationCounts = {};
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
        creditedHours += scheduleHours(schedule, timezone);
        creditedSchedules += 1;
      }
      continue;
    }

    if (scheduleExpired(schedule, timezone, now)) unresolvedSchedules += 1;
  }

  return {
    missedShifts,
    creditedHours: Number(creditedHours.toFixed(2)),
    creditedSchedules,
    unresolvedSchedules,
    classificationCounts,
    publicHolidayScheduleIds,
  };
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function calculateLatenessPenaltyProposal({
  profile,
  expectedHours,
  lateShifts,
  lateThresholdMinutes,
  enabled,
}) {
  if (!enabled || lateThresholdMinutes === null || !lateShifts.length) {
    return { deductibleMinutes: 0, hourlyRate: 0, amount: 0 };
  }
  const deductibleMinutes = lateShifts.reduce(
    (sum, shift) =>
      sum + Math.max(0, Number(shift?.late_minutes || 0) - lateThresholdMinutes),
    0
  );
  if (deductibleMinutes <= 0) {
    return { deductibleMinutes: 0, hourlyRate: 0, amount: 0 };
  }
  const configuredHourlyRate = Number(profile?.hourly_rate || 0);
  const monthlySalary = Number(profile?.monthly_salary || 0);
  const derivedHourlyRate =
    configuredHourlyRate > 0
      ? configuredHourlyRate
      : monthlySalary > 0 && expectedHours > 0
        ? monthlySalary / expectedHours
        : 0;
  if (!Number.isFinite(derivedHourlyRate) || derivedHourlyRate <= 0) {
    return { deductibleMinutes, hourlyRate: 0, amount: 0 };
  }
  return {
    deductibleMinutes,
    hourlyRate: Number(derivedHourlyRate.toFixed(4)),
    amount: Number(((derivedHourlyRate / 60) * deductibleMinutes).toFixed(2)),
  };
}

export async function calculateMonthlyPayroll({ organizationId, entityId, payrollMonth }) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!payrollMonth) throw new Error("payrollMonth required");

  const range = monthRange(payrollMonth);
  const payrollMonthEnd = monthEnd(payrollMonth);
  const [
    payrollSettings,
    workforceSettings,
    timeContext,
    calendarRows,
    employmentCohort,
  ] = await Promise.all([
    loadOperationalSettings({ organizationId, domain: "PAYROLL" }),
    loadOperationalSettings({ organizationId, domain: "WORKFORCE" }),
    resolveOrganizationTimeContext({ organizationId, entityId }),
    loadWorkforceCalendar({
      organizationId,
      entityId,
      startDate: range.start,
      endDate: range.end,
      includeCancelled: false,
    }),
    loadEmploymentCohort({
      organizationId,
      entityId,
      startDate: range.start,
      endDate: payrollMonthEnd,
    }),
  ]);

  if (employmentCohort.partialPeriodStaffIds.length > 0) {
    throw new Error(
      "Payroll calculation requires full-month legal-entity employment assignments; split-period payroll is not supported yet"
    );
  }

  const entityStaffIds = new Set(employmentCohort.fullPeriodStaffIds);
  const publicHolidayByDate = new Map(
    calendarRows
      .filter((row) => row.day_type === "PUBLIC_HOLIDAY")
      .map((row) => [row.calendar_date, row])
  );
  const lateThresholdMinutes = nonNegativeInteger(workforceSettings?.late_threshold_minutes);
  const latenessDeductionEnabled = payrollSettings?.lateness_deduction_enabled === true;
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

  const [
    compensationResult,
    shiftsResult,
    attendanceResult,
    schedulesResult,
    ordersResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("employee_compensation_profiles")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .lte("effective_from", payrollMonthEnd)
      .or(`effective_to.is.null,effective_to.gte.${range.start}`),
    supabaseAdmin
      .from("staff_shifts")
      .select("*")
      .eq("organization_id", organizationId)
      .gte("clock_in", rangeStart.toISOString())
      .lt("clock_in", rangeEnd.toISOString()),
    supabaseAdmin
      .from("staff_attendance")
      .select("*")
      .eq("organization_id", organizationId)
      .gte("shift_date", range.start)
      .lt("shift_date", range.end),
    supabaseAdmin
      .from("staff_schedules")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "PUBLISHED")
      .gte("shift_date", range.start)
      .lt("shift_date", range.end),
    supabaseAdmin
      .from("orders")
      .select("service_charge,service_charge_amount")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("payment_status", "PAID")
      .gte("completed_at", rangeStart.toISOString())
      .lt("completed_at", rangeEnd.toISOString()),
  ]);

  for (const result of [
    compensationResult,
    shiftsResult,
    attendanceResult,
    schedulesResult,
    ordersResult,
  ]) {
    if (result.error) throw result.error;
  }

  const compensationByStaff = new Map();
  for (const profile of compensationResult.data || []) {
    if (entityStaffIds.has(profile.staff_account_id) && !compensationByStaff.has(profile.staff_account_id)) {
      compensationByStaff.set(profile.staff_account_id, profile);
    }
  }

  const staff = employmentCohort.staff.filter(
    (member) => entityStaffIds.has(member.id) && compensationByStaff.has(member.id)
  );
  const approvedTimeOffEntries = await Promise.all(
    staff.map(async (member) => [
      member.id,
      await loadApprovedTimeOffForRange({
        organizationId,
        staffId: member.id,
        startDate: range.start,
        endDate: range.end,
      }),
    ])
  );
  const approvedTimeOffByStaff = new Map(approvedTimeOffEntries);

  const rawShifts = (shiftsResult.data || []).filter((shift) =>
    entityStaffIds.has(shift.staff_id)
  );
  const corrections = await loadAttendanceCorrections({
    organizationId,
    shiftIds: rawShifts.map((shift) => shift.id),
  });
  const effectiveRawShifts = applyEffectiveShiftCorrections({
    shifts: rawShifts,
    corrections,
  });
  const excludedShiftIds = new Set(
    effectiveRawShifts
      .filter((shift) => !payrollEligibleShift(shift))
      .map((shift) => shift.id)
      .filter(Boolean)
  );
  const shifts = effectiveRawShifts.filter(payrollEligibleShift);
  const attendance = (attendanceResult.data || []).filter(
    (row) =>
      entityStaffIds.has(row.staff_id) &&
      (!row.shift_id || !excludedShiftIds.has(row.shift_id))
  );
  const schedules = (schedulesResult.data || []).filter((row) =>
    entityStaffIds.has(row.staff_id)
  );
  const totalServiceCharge = (ordersResult.data || []).reduce(
    (sum, order) =>
      sum + Number(order.service_charge_amount ?? order.service_charge ?? 0),
    0
  );

  const staffPerformance = staff.map((member) => {
    const profile = compensationByStaff.get(member.id);
    const memberShifts = shifts.filter((shift) => shift.staff_id === member.id);
    const memberAttendance = attendance.filter((row) => row.staff_id === member.id);
    const memberSchedules = schedules.filter((row) => row.staff_id === member.id);
    const memberApprovedTimeOff = approvedTimeOffByStaff.get(member.id) || [];
    const plannedHours = memberSchedules.reduce(
      (sum, schedule) => sum + scheduleHours(schedule, timeContext.timezone),
      0
    );
    const expectedHours =
      payrollSettings?.use_schedule_expected_hours && plannedHours > 0
        ? plannedHours
        : fallbackExpectedHours(payrollMonth, payrollSettings);
    const totalHours = memberShifts.reduce(
      (sum, shift) => sum + hoursBetween(shift.clock_in, shift.clock_out),
      0
    );
    const completedShifts = memberShifts.filter(
      (shift) => shift.shift_status === "COMPLETED" || Boolean(shift.clock_out)
    ).length;
    const attendanceReconciliation = reconcileScheduledAttendance({
      schedules: memberSchedules,
      shifts: memberShifts,
      attendance: memberAttendance,
      approvedTimeOff: memberApprovedTimeOff,
      publicHolidayByDate,
      timezone: timeContext.timezone,
      payrollSettings,
    });
    const missedShifts = attendanceReconciliation.missedShifts;
    const classifiedLateShifts = memberShifts.filter((shift) => shift.is_late === true);
    const lateCount = classifiedLateShifts.length;
    const shiftLateMinutes = classifiedLateShifts.reduce(
      (sum, shift) => sum + Number(shift.late_minutes || 0),
      0
    );
    const legacyAttendanceLateMinutes = memberAttendance.reduce(
      (sum, row) => (!row.shift_id ? sum + Number(row.late_minutes || 0) : sum),
      0
    );
    const finalLateMinutes = Math.max(shiftLateMinutes, legacyAttendanceLateMinutes);
    const overtimeHours = Number(
      (
        memberShifts.reduce(
          (sum, shift) => sum + Number(shift.overtime_minutes || 0),
          0
        ) / 60
      ).toFixed(2)
    );
    const workedHours = Number(totalHours.toFixed(2));
    const normalizedExpectedHours = Number(expectedHours.toFixed(2));
    const approvedHours = Number(
      (workedHours + attendanceReconciliation.creditedHours).toFixed(2)
    );
    const varianceHours = Number((approvedHours - normalizedExpectedHours).toFixed(2));
    const hasPayrollExposure =
      Number(profile?.monthly_salary || 0) > 0 || Number(profile?.hourly_rate || 0) > 0;
    const hoursVarianceReviewRequired =
      hasPayrollExposure &&
      Boolean(payrollSettings?.manager_approval_required) &&
      Math.abs(varianceHours) > Number(payrollSettings?.variance_threshold_hours || 0);
    const unresolvedAttendanceReviewRequired =
      attendanceReconciliation.unresolvedSchedules > 0;
    const latenessPenalty = calculateLatenessPenaltyProposal({
      profile,
      expectedHours: normalizedExpectedHours,
      lateShifts: classifiedLateShifts,
      lateThresholdMinutes,
      enabled: latenessDeductionEnabled,
    });
    const latenessReviewRequired = latenessPenalty.amount > 0;
    const reviewRequired =
      unresolvedAttendanceReviewRequired ||
      hoursVarianceReviewRequired ||
      latenessReviewRequired;
    const reviewReasons = [];
    if (unresolvedAttendanceReviewRequired) {
      reviewReasons.push(
        `${attendanceReconciliation.unresolvedSchedules} expired published schedule${
          attendanceReconciliation.unresolvedSchedules === 1 ? " has" : "s have"
        } no worked or approved attendance outcome`
      );
    }
    if (hoursVarianceReviewRequired) {
      reviewReasons.push("Hours variance requires manager review");
    }
    if (latenessReviewRequired) {
      reviewReasons.push(
        `Proposed lateness deduction ${latenessPenalty.amount.toFixed(2)} for ${
          latenessPenalty.deductibleMinutes
        } minute${
          latenessPenalty.deductibleMinutes === 1 ? "" : "s"
        } above the configured grace threshold`
      );
    }
    const attendanceScore = calculateAttendanceScore({
      lateMinutes: finalLateMinutes,
      overtimeHours,
    });

    return {
      id: member.id,
      partyId: member.party_id,
      name: member.name || member.email,
      role: member.role,
      department: member.department || member.position || "UNASSIGNED",
      position: member.position,
      totalHours: workedHours,
      expectedHours: normalizedExpectedHours,
      workedHours,
      approvedHours,
      varianceHours,
      reviewRequired,
      reviewStatus: reviewRequired ? "PENDING" : "NOT_REQUIRED",
      reviewReason: reviewReasons.length ? reviewReasons.join(" · ") : null,
      overtimeHours,
      attendanceScore,
      attendancePenalty: latenessPenalty.amount,
      latenessDeductibleMinutes: latenessPenalty.deductibleMinutes,
      latenessHourlyRate: latenessPenalty.hourlyRate,
      completedShifts,
      missedShifts,
      attendanceCreditedHours: attendanceReconciliation.creditedHours,
      attendanceCreditedSchedules: attendanceReconciliation.creditedSchedules,
      approvedTimeOffCount: memberApprovedTimeOff.length,
      publicHolidayScheduleCount:
        attendanceReconciliation.publicHolidayScheduleIds.length,
      unresolvedAttendanceSchedules: attendanceReconciliation.unresolvedSchedules,
      attendanceClassificationCounts: attendanceReconciliation.classificationCounts,
      lateCount,
      totalLateMinutes: finalLateMinutes,
      multiplier: Number((attendanceScore / 100).toFixed(2)),
      baseSalary: Number(profile?.monthly_salary || 0),
      hourlyRate: Number(profile?.hourly_rate || 0),
    };
  });

  const payoutResult = await calculateDailyPayouts({
    organizationId,
    serviceCharge: totalServiceCharge,
    staffPerformance,
  });
  const payrollData = payoutResult.map((member) => ({
    ...member,
    serviceChargeBonus: Number(member.payout || 0),
  }));
  const records = await buildPayrollRecords({
    organizationId,
    entityId,
    payrollMonth,
    payrollData,
  });

  return {
    success: true,
    organizationId,
    entityId,
    payrollMonth,
    timezone: timeContext.timezone,
    totalServiceCharge: Number(totalServiceCharge.toFixed(2)),
    staffCount: payrollData.length,
    employmentAssignmentCount: employmentCohort.assignments.length,
    attendanceCorrectionCount: corrections.length,
    approvedTimeOffCount: approvedTimeOffEntries.reduce(
      (sum, [, rows]) => sum + rows.length,
      0
    ),
    publicHolidayCount: publicHolidayByDate.size,
    records,
  };
}

export default async function generateMonthlyPayroll({
  organizationId,
  entityId,
  payrollMonth,
}) {
  const calculation = await calculateMonthlyPayroll({
    organizationId,
    entityId,
    payrollMonth,
  });
  const { data: existingPayroll, error: existingPayrollError } = await supabaseAdmin
    .from("payroll_records")
    .select("id,status")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("payroll_month", payrollMonth);
  if (existingPayrollError) throw existingPayrollError;

  const replaceableStatuses = new Set(["GENERATED", "RECALCULATED", "REJECTED"]);
  const lockedPayroll = (existingPayroll || []).filter(
    (record) => !replaceableStatuses.has(record.status)
  );
  if (lockedPayroll.length > 0) {
    throw new Error("Payroll already approved or locked for this month");
  }
  const existingIds = (existingPayroll || []).map((record) => record.id);
  if (existingIds.length > 0) {
    const { error: approvalDeleteError } = await supabaseAdmin
      .from("approval_requests")
      .delete()
      .eq("organization_id", organizationId)
      .eq("reference_table", "payroll_records")
      .in("reference_id", existingIds);
    if (approvalDeleteError) throw approvalDeleteError;
    const { error: payrollDeleteError } = await supabaseAdmin
      .from("payroll_records")
      .delete()
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("payroll_month", payrollMonth)
      .in("status", ["GENERATED", "RECALCULATED", "REJECTED"]);
    if (payrollDeleteError) throw payrollDeleteError;
  }

  const records = await persistPayrollRecords(calculation.records);
  return { ...calculation, records };
}
