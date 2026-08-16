import resolvePayrollJurisdiction from "@/lib/payroll/countries/resolvePayrollJurisdiction";
import { loadEmploymentCohort } from "@/lib/people/employees/employmentAssignmentService";
import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  localDateString,
  resolveOrganizationTimeContext,
  zonedDateTimeToUtc,
} from "@/lib/shared/time/organizationTime";

const PAYROLL_FINANCE_EVENTS = Object.freeze([
  "PAYROLL_NET",
  "PAYROLL_TAX",
  "PAYROLL_SOCIAL_SECURITY",
  "PAYROLL_DEDUCTION",
  "PAYROLL_SETTLEMENT",
]);

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

function staffDrilldown(rows = []) {
  return rows.map((member) => ({
    staffId: member.id,
    partyId: member.party_id || null,
    name: member.name || member.email || member.id,
    role: member.role || null,
    department: member.department || null,
    position: member.position || null,
  }));
}

function issue(code, message, count = null, affectedStaff = []) {
  const people = staffDrilldown(affectedStaff);
  const affectedNames = people.map((member) => member.name).filter(Boolean);

  return {
    code,
    message: affectedNames.length
      ? `${message} Affected: ${affectedNames.join(", ")}.`
      : message,
    count,
    affectedStaff: people,
  };
}

function payrollEligibleShift(shift) {
  const approvalStatus = String(shift?.approval_status || "").toUpperCase();

  if (shift?.is_valid === false) return false;
  if (approvalStatus === "REJECTED" || approvalStatus === "PENDING") return false;

  return true;
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
  const payrollMonthEnd = monthEnd(payrollMonth);
  const [settings, timeContext, jurisdiction, employmentCohort] = await Promise.all([
    loadOperationalSettings({ organizationId, domain: "PAYROLL" }),
    resolveOrganizationTimeContext({ organizationId, entityId }),
    resolvePayrollJurisdiction({ organizationId, entityId }),
    loadEmploymentCohort({
      organizationId,
      entityId,
      startDate: range.start,
      endDate: payrollMonthEnd,
    }),
  ]);

  const currentMonth = localDateString(new Date(), timeContext.timezone).slice(0, 7);
  const entityStaffIds = new Set(employmentCohort.staffIds);
  const partialPeriodStaffIds = new Set(employmentCohort.partialPeriodStaffIds);

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
    schedulesResult,
    shiftsResult,
    attendanceResult,
    payrollResult,
    paymentMethodResult,
    accountingPeriodResult,
    postingRuleResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("employee_compensation_profiles")
      .select("id,staff_account_id,party_id,entity_id,effective_from,effective_to,monthly_salary,hourly_rate,salary_type,payroll_frequency,currency,bank_name,bank_account")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .lte("effective_from", payrollMonthEnd)
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
      .select("id,staff_id,clock_in,clock_out,shift_status,approval_status,is_valid")
      .eq("organization_id", organizationId)
      .gte("clock_in", rangeStart.toISOString())
      .lt("clock_in", rangeEnd.toISOString()),
    supabaseAdmin
      .from("staff_attendance")
      .select("id,staff_id,shift_id,shift_date")
      .eq("organization_id", organizationId)
      .gte("shift_date", range.start)
      .lt("shift_date", range.end),
    supabaseAdmin
      .from("payroll_records")
      .select("id,staff_id,status")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("payroll_month", payrollMonth),
    supabaseAdmin
      .from("organization_payment_config")
      .select("payment_method,country,currency,enabled")
      .eq("organization_id", organizationId)
      .eq("enabled", true),
    supabaseAdmin
      .from("accounting_periods")
      .select("id,status,start_date,end_date")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .lte("start_date", payrollMonthEnd)
      .gte("end_date", range.start),
    supabaseAdmin
      .from("finance_posting_rules")
      .select("id,event_type,status,effective_from,effective_to")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("source_module", "PAYROLL")
      .eq("status", "ACTIVE")
      .in("event_type", PAYROLL_FINANCE_EVENTS)
      .lte("effective_from", payrollMonthEnd)
      .or(`effective_to.is.null,effective_to.gte.${range.start}`),
  ]);

  for (const result of [
    compensationResult,
    schedulesResult,
    shiftsResult,
    attendanceResult,
    payrollResult,
    paymentMethodResult,
    accountingPeriodResult,
    postingRuleResult,
  ]) {
    if (result.error) throw result.error;
  }

  const staff = employmentCohort.staff;
  const staffById = new Map(staff.map((member) => [member.id, member]));
  const compensationByStaff = new Map();
  for (const profile of compensationResult.data || []) {
    if (entityStaffIds.has(profile.staff_account_id) && !compensationByStaff.has(profile.staff_account_id)) {
      compensationByStaff.set(profile.staff_account_id, profile);
    }
  }

  const schedules = (schedulesResult.data || []).filter((row) => entityStaffIds.has(row.staff_id));
  const rawShifts = (shiftsResult.data || []).filter((row) => entityStaffIds.has(row.staff_id));
  const excludedShiftIds = new Set(
    rawShifts
      .filter((shift) => !payrollEligibleShift(shift))
      .map((shift) => shift.id)
      .filter(Boolean)
  );
  const shifts = rawShifts.filter(payrollEligibleShift);
  const attendance = (attendanceResult.data || []).filter(
    (row) =>
      entityStaffIds.has(row.staff_id) &&
      (!row.shift_id || !excludedShiftIds.has(row.shift_id))
  );
  const existingPayroll = payrollResult.data || [];
  const allPaymentMethods = paymentMethodResult.data || [];
  const paymentMethods = allPaymentMethods.filter((method) => {
    const currency = String(method.currency || "").trim().toUpperCase();
    const country = String(method.country || "").trim().toUpperCase();
    return (
      currency === jurisdiction.currency &&
      (!country || country === jurisdiction.country)
    );
  });
  const accountingPeriods = accountingPeriodResult.data || [];
  const postingRules = postingRuleResult.data || [];

  const scheduledStaffIds = new Set(schedules.map((row) => row.staff_id));
  const shiftStaffIds = new Set(shifts.map((row) => row.staff_id));
  const attendanceStaffIds = new Set(attendance.map((row) => row.staff_id));

  const partialPeriodStaff = staff.filter((member) => partialPeriodStaffIds.has(member.id));
  const missingCompensation = staff.filter((member) => !compensationByStaff.has(member.id));
  const unconfiguredCompensation = staff.filter((member) => {
    const profile = compensationByStaff.get(member.id);
    if (!profile) return false;
    return Number(profile.monthly_salary || 0) <= 0 && Number(profile.hourly_rate || 0) <= 0;
  });
  const currencyMismatch = staff.filter((member) => {
    const profile = compensationByStaff.get(member.id);
    if (!profile) return false;
    return String(profile.currency || "").trim().toUpperCase() !== jurisdiction.currency;
  });
  const payrollExposedStaff = staff.filter((member) => {
    const profile = compensationByStaff.get(member.id);
    return Boolean(
      profile &&
        (Number(profile.monthly_salary || 0) > 0 || Number(profile.hourly_rate || 0) > 0)
    );
  });
  const missingBankDetails = payrollExposedStaff.filter((member) => {
    const profile = compensationByStaff.get(member.id);
    return Boolean(
      profile &&
        (!String(profile.bank_name || "").trim() || !String(profile.bank_account || "").trim())
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

  const replaceableStatuses = new Set(["GENERATED", "RECALCULATED", "REJECTED"]);
  const lockedExistingPayroll = existingPayroll.filter(
    (record) => !replaceableStatuses.has(record.status)
  );
  const lockedPayrollStaff = lockedExistingPayroll
    .map((record) => staffById.get(record.staff_id))
    .filter(Boolean);

  const activePostingEvents = new Set(
    postingRules.map((rule) => String(rule.event_type || "").trim().toUpperCase())
  );
  const missingPostingEvents = PAYROLL_FINANCE_EVENTS.filter(
    (eventType) => !activePostingEvents.has(eventType)
  );
  const hasOpenAccountingPeriod = accountingPeriods.some((period) =>
    ["OPEN", "ACTIVE"].includes(String(period.status || "").trim().toUpperCase())
  );

  const blockers = [];
  const warnings = [];
  const lifecycleBlockers = [];

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
    blockers.push(
      issue(
        "NO_ACTIVE_STAFF",
        "No active employees are assigned to this legal entity for the payroll month."
      )
    );
  }

  if (partialPeriodStaff.length) {
    blockers.push(
      issue(
        "EMPLOYMENT_PERIOD_UNSUPPORTED",
        "Legal-entity employment changes inside a payroll month require split-period payroll and proration support. Use a full-month legal-employer assignment before generating payroll.",
        partialPeriodStaff.length,
        partialPeriodStaff
      )
    );
  }

  if (missingCompensation.length) {
    blockers.push(
      issue(
        "COMPENSATION_PROFILE_MISSING",
        `${missingCompensation.length} assigned employee${missingCompensation.length === 1 ? " does" : "s do"} not have an effective compensation profile for this legal entity.`,
        missingCompensation.length,
        missingCompensation
      )
    );
  }

  if (unconfiguredCompensation.length) {
    blockers.push(
      issue(
        "COMPENSATION_AMOUNT_MISSING",
        `${unconfiguredCompensation.length} employee${unconfiguredCompensation.length === 1 ? " has" : "s have"} no monthly salary or hourly rate configured.`,
        unconfiguredCompensation.length,
        unconfiguredCompensation
      )
    );
  }

  if (currencyMismatch.length) {
    blockers.push(
      issue(
        "COMPENSATION_CURRENCY_MISMATCH",
        `${currencyMismatch.length} compensation profile${currencyMismatch.length === 1 ? " does" : "s do"} not match the legal entity currency ${jurisdiction.currency}.`,
        currencyMismatch.length,
        currencyMismatch
      )
    );
  }

  if (missingSchedules.length) {
    blockers.push(
      issue(
        "SCHEDULES_MISSING",
        `${missingSchedules.length} paid employee${missingSchedules.length === 1 ? " has" : "s have"} no published schedule for ${payrollMonth}, while payroll is configured to use scheduled expected hours.`,
        missingSchedules.length,
        missingSchedules
      )
    );
  }

  if (lockedExistingPayroll.length) {
    blockers.push(
      issue(
        "PAYROLL_ALREADY_LOCKED",
        "Payroll for this legal entity and month already contains approved, locked or paid records and cannot be regenerated.",
        lockedExistingPayroll.length,
        lockedPayrollStaff
      )
    );
  }

  if (scheduledWithoutShiftEvidence.length) {
    warnings.push(
      issue(
        "SHIFT_EVIDENCE_MISSING",
        `${scheduledWithoutShiftEvidence.length} scheduled paid employee${scheduledWithoutShiftEvidence.length === 1 ? " has" : "s have"} no approved shift evidence for the month. Review attendance or confirm absences before approval.`,
        scheduledWithoutShiftEvidence.length,
        scheduledWithoutShiftEvidence
      )
    );
  }

  if (scheduledWithoutAttendance.length) {
    warnings.push(
      issue(
        "ATTENDANCE_EVIDENCE_MISSING",
        `${scheduledWithoutAttendance.length} scheduled paid employee${scheduledWithoutAttendance.length === 1 ? " has" : "s have"} no approved attendance evidence for the month. Review attendance before approval.`,
        scheduledWithoutAttendance.length,
        scheduledWithoutAttendance
      )
    );
  }

  if (!allPaymentMethods.length) {
    lifecycleBlockers.push(
      issue(
        "PAYMENT_METHOD_MISSING",
        "No enabled payroll payment method is configured for this organization."
      )
    );
  } else if (!paymentMethods.length) {
    lifecycleBlockers.push(
      issue(
        "PAYMENT_CURRENCY_MISMATCH",
        `No enabled payroll payment method matches ${jurisdiction.country} / ${jurisdiction.currency} for this legal entity.`
      )
    );
  }

  const bankTransferEnabled = paymentMethods.some(
    (method) => String(method.payment_method || "").trim().toLowerCase() === "bank_transfer"
  );

  if (bankTransferEnabled && missingBankDetails.length) {
    lifecycleBlockers.push(
      issue(
        "BANK_DETAILS_MISSING",
        `${missingBankDetails.length} paid employee${missingBankDetails.length === 1 ? " is" : "s are"} missing bank details required for bank-transfer payroll.`,
        missingBankDetails.length,
        missingBankDetails
      )
    );
  }

  if (!hasOpenAccountingPeriod) {
    lifecycleBlockers.push(
      issue(
        "ACCOUNTING_PERIOD_NOT_OPEN",
        `No open Finance accounting period covers payroll month ${payrollMonth}.`
      )
    );
  }

  if (missingPostingEvents.length) {
    lifecycleBlockers.push(
      issue(
        "PAYROLL_POSTING_RULES_MISSING",
        `Finance posting rules are missing for: ${missingPostingEvents.join(", ")}.`
      )
    );
  }

  return {
    organizationId,
    entityId,
    payrollMonth,
    currentMonth,
    timezone: timeContext.timezone,
    jurisdiction: {
      country: jurisdiction.country,
      currency: jurisdiction.currency,
    },
    settings: {
      country: jurisdiction.country,
      currency: jurisdiction.currency,
      useScheduleExpectedHours: Boolean(settings?.use_schedule_expected_hours),
      managerApprovalRequired: Boolean(settings?.manager_approval_required),
      varianceThresholdHours: Number(settings?.variance_threshold_hours || 0),
    },
    summary: {
      activeStaff: staff.length,
      employmentAssignments: employmentCohort.assignments.length,
      partialPeriodEmployment: partialPeriodStaff.length,
      compensationProfiles: compensationByStaff.size,
      compensationUnconfigured: unconfiguredCompensation.length,
      compensationCurrencyMismatch: currencyMismatch.length,
      paidStaff: payrollExposedStaff.length,
      bankDetailsMissing: missingBankDetails.length,
      paymentMethods: paymentMethods.length,
      payrollPostingRules: activePostingEvents.size,
      openAccountingPeriod: hasOpenAccountingPeriod,
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
    lifecycleBlockers,
    canGenerate: blockers.length === 0,
    canCompleteLifecycle: blockers.length === 0 && lifecycleBlockers.length === 0,
  };
}
