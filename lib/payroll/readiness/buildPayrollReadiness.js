import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  localDateString,
  resolveOrganizationTimeContext,
  zonedDateTimeToUtc,
} from "@/lib/shared/time/organizationTime";

function monthRange(payrollMonth) {
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

function issue(code, message, count = null) {
  return { code, message, count };
}

export default async function buildPayrollReadiness({
  organizationId,
  entityId,
  payrollMonth,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!/^\d{4}-\d{2}$/.test(String(payrollMonth || ""))) {
    throw new Error("payrollMonth must use YYYY-MM format");
  }

  const range = monthRange(payrollMonth);
  const [settings, timeContext] = await Promise.all([
    loadOperationalSettings({ organizationId, domain: "PAYROLL" }),
    resolveOrganizationTimeContext({ organizationId, entityId }),
  ]);

  const currentMonth = localDateString(
    new Date(),
    timeContext.timezone
  ).slice(0, 7);

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
    staffResult,
    compensationResult,
    schedulesResult,
    shiftsResult,
    attendanceResult,
    payrollResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("staff_accounts")
      .select("id,name,email,role,department,position,party_id")
      .eq("active_organization_id", organizationId)
      .eq("active", true),
    supabaseAdmin
      .from("employee_compensation_profiles")
      .select("id,staff_account_id,party_id,entity_id,effective_from,effective_to,monthly_salary,hourly_rate,salary_type,payroll_frequency,currency")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .lte("effective_from", monthEnd(payrollMonth))
      .or(`effective_to.is.null,effective_to.gte.${range.start}`)
      .order("effective_from", { ascending: false }),
    supabaseAdmin
      .from("staff_schedules")
      .select("id,staff_id,shift_date")
      .eq("organization_id", organizationId)
      .eq("status", "PUBLISHED")
      .gte("shift_date", range.start)
      .lt("shift_date", range.end),
    supabaseAdmin
      .from("staff_shifts")
      .select("id,staff_id,clock_in,clock_out,shift_status")
      .eq("organization_id", organizationId)
      .gte("clock_in", rangeStart.toISOString())
      .lt("clock_in", rangeEnd.toISOString()),
    supabaseAdmin
      .from("staff_attendance")
      .select("id,staff_id,shift_date")
      .eq("organization_id", organizationId)
      .gte("shift_date", range.start)
      .lt("shift_date", range.end),
    supabaseAdmin
      .from("payroll_records")
      .select("id,staff_id,status")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("payroll_month", payrollMonth),
  ]);

  for (const result of [
    staffResult,
    compensationResult,
    schedulesResult,
    shiftsResult,
    attendanceResult,
    payrollResult,
  ]) {
    if (result.error) throw result.error;
  }

  const staff = staffResult.data || [];
  const compensationByStaff = new Map();
  for (const profile of compensationResult.data || []) {
    if (!compensationByStaff.has(profile.staff_account_id)) {
      compensationByStaff.set(profile.staff_account_id, profile);
    }
  }

  const schedules = schedulesResult.data || [];
  const shifts = shiftsResult.data || [];
  const attendance = attendanceResult.data || [];
  const existingPayroll = payrollResult.data || [];

  const scheduledStaffIds = new Set(schedules.map((row) => row.staff_id));
  const shiftStaffIds = new Set(shifts.map((row) => row.staff_id));
  const attendanceStaffIds = new Set(attendance.map((row) => row.staff_id));

  const missingCompensation = staff.filter(
    (member) => !compensationByStaff.has(member.id)
  );
  const unconfiguredCompensation = staff.filter((member) => {
    const profile = compensationByStaff.get(member.id);
    if (!profile) return false;
    return (
      Number(profile.monthly_salary || 0) <= 0 &&
      Number(profile.hourly_rate || 0) <= 0
    );
  });
  const payrollExposedStaff = staff.filter((member) => {
    const profile = compensationByStaff.get(member.id);
    return Boolean(
      profile &&
        (Number(profile.monthly_salary || 0) > 0 ||
          Number(profile.hourly_rate || 0) > 0)
    );
  });
  const missingSchedules = settings?.use_schedule_expected_hours
    ? payrollExposedStaff.filter((member) => !scheduledStaffIds.has(member.id))
    : [];
  const scheduledWithoutShiftEvidence = payrollExposedStaff.filter(
    (member) => scheduledStaffIds.has(member.id) && !shiftStaffIds.has(member.id)
  );
  const scheduledWithoutAttendance = payrollExposedStaff.filter(
    (member) => scheduledStaffIds.has(member.id) && !attendanceStaffIds.has(member.id)
  );

  const replaceableStatuses = new Set([
    "GENERATED",
    "RECALCULATED",
    "REJECTED",
  ]);
  const lockedExistingPayroll = existingPayroll.filter(
    (record) => !replaceableStatuses.has(record.status)
  );

  const blockers = [];
  const warnings = [];

  if (payrollMonth >= currentMonth) {
    blockers.push(
      issue(
        "PAYROLL_PERIOD_OPEN",
        payrollMonth === currentMonth
          ? "Payroll month is still in progress. Generate monthly payroll after the period closes."
          : "Future payroll months cannot be generated."
      )
    );
  }

  if (!staff.length) {
    blockers.push(issue("NO_ACTIVE_STAFF", "No active staff are available for payroll."));
  }

  if (!String(settings?.country || "").trim()) {
    blockers.push(
      issue(
        "PAYROLL_COUNTRY_MISSING",
        "Payroll country is not configured, so tax and statutory calculations cannot run."
      )
    );
  }

  if (!/^[A-Z]{3}$/.test(String(settings?.currency || "").trim().toUpperCase())) {
    blockers.push(
      issue(
        "PAYROLL_CURRENCY_MISSING",
        "Payroll currency is not configured with a valid 3-letter currency code."
      )
    );
  }

  if (missingCompensation.length) {
    blockers.push(
      issue(
        "COMPENSATION_PROFILE_MISSING",
        `${missingCompensation.length} active staff member${missingCompensation.length === 1 ? "" : "s"} do not have an effective compensation profile for this legal entity.`,
        missingCompensation.length
      )
    );
  }

  if (unconfiguredCompensation.length) {
    blockers.push(
      issue(
        "COMPENSATION_AMOUNT_MISSING",
        `${unconfiguredCompensation.length} staff member${unconfiguredCompensation.length === 1 ? "" : "s"} have no monthly salary or hourly rate configured.`,
        unconfiguredCompensation.length
      )
    );
  }

  if (missingSchedules.length) {
    blockers.push(
      issue(
        "SCHEDULES_MISSING",
        `${missingSchedules.length} paid staff member${missingSchedules.length === 1 ? "" : "s"} have no published schedule for ${payrollMonth}, while payroll is configured to use scheduled expected hours.`,
        missingSchedules.length
      )
    );
  }

  if (lockedExistingPayroll.length) {
    blockers.push(
      issue(
        "PAYROLL_ALREADY_LOCKED",
        "Payroll for this month already contains approved, locked or paid records and cannot be regenerated.",
        lockedExistingPayroll.length
      )
    );
  }

  if (scheduledWithoutShiftEvidence.length) {
    warnings.push(
      issue(
        "SHIFT_EVIDENCE_MISSING",
        `${scheduledWithoutShiftEvidence.length} scheduled paid staff member${scheduledWithoutShiftEvidence.length === 1 ? " has" : "s have"} no shift evidence for the month. Review absences before approval.`,
        scheduledWithoutShiftEvidence.length
      )
    );
  }

  if (scheduledWithoutAttendance.length) {
    warnings.push(
      issue(
        "ATTENDANCE_EVIDENCE_MISSING",
        `${scheduledWithoutAttendance.length} scheduled paid staff member${scheduledWithoutAttendance.length === 1 ? " has" : "s have"} no attendance rows for the month. Review attendance before approval.`,
        scheduledWithoutAttendance.length
      )
    );
  }

  return {
    organizationId,
    entityId,
    payrollMonth,
    currentMonth,
    timezone: timeContext.timezone,
    settings: {
      country: settings?.country || null,
      currency: settings?.currency || null,
      useScheduleExpectedHours: Boolean(settings?.use_schedule_expected_hours),
      managerApprovalRequired: Boolean(settings?.manager_approval_required),
      varianceThresholdHours: Number(settings?.variance_threshold_hours || 0),
    },
    summary: {
      activeStaff: staff.length,
      compensationProfiles: compensationByStaff.size,
      compensationUnconfigured: unconfiguredCompensation.length,
      paidStaff: payrollExposedStaff.length,
      scheduleRows: schedules.length,
      scheduledStaff: scheduledStaffIds.size,
      shiftRows: shifts.length,
      shiftStaff: shiftStaffIds.size,
      attendanceRows: attendance.length,
      attendanceStaff: attendanceStaffIds.size,
      existingPayrollRecords: existingPayroll.length,
    },
    blockers,
    warnings,
    canGenerate: blockers.length === 0,
  };
}
