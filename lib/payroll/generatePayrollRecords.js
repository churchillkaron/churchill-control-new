import {
  PAYROLL_STATUS,
} from "@/lib/payroll/consolidation/payrollStatusMachine";
import loadPayrollCountryPack from "@/lib/payroll/countries/loadPayrollCountryPack";
import resolvePayrollJurisdiction from "@/lib/payroll/countries/resolvePayrollJurisdiction";
import calculateLeavePayout from "@/lib/payroll/leave/calculateLeavePayout";
import calculateOvertimePay from "@/lib/payroll/overtime/calculateOvertimePay";
import calculateProgressiveTax from "@/lib/payroll/tax/calculateProgressiveTax";
import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
import { supabaseAdmin as supabase } from "@/lib/shared/supabase/admin";

function monthEnd(payrollMonth) {
  const date = new Date(`${payrollMonth}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonNegative(value) {
  return Math.max(0, number(value, 0));
}

function money(value) {
  return Number(number(value, 0).toFixed(2));
}

function resolveCompensationPay({ profile, employee, payrollSettings }) {
  const salaryType = String(profile?.salary_type || "").trim().toUpperCase();
  const monthlySalary = nonNegative(profile?.monthly_salary);
  const configuredHourlyRate = nonNegative(profile?.hourly_rate);
  const approvedHours = nonNegative(
    employee?.approvedHours ?? employee?.workedHours ?? employee?.totalHours
  );
  const expectedHours = nonNegative(employee?.expectedHours);
  const overtimeHours = nonNegative(employee?.overtimeHours);

  if (salaryType !== "MONTHLY" && salaryType !== "HOURLY") {
    throw new Error(
      `Unsupported salary type for ${employee?.name || employee?.id || "employee"}`
    );
  }

  if (salaryType === "MONTHLY" && monthlySalary <= 0) {
    throw new Error(
      `Monthly salary must be greater than zero for ${employee?.name || employee?.id || "employee"}`
    );
  }

  if (salaryType === "HOURLY" && configuredHourlyRate <= 0) {
    throw new Error(
      `Hourly rate must be greater than zero for ${employee?.name || employee?.id || "employee"}`
    );
  }

  const regularHours =
    salaryType === "HOURLY"
      ? Math.max(0, approvedHours - overtimeHours)
      : 0;

  const baseSalary =
    salaryType === "HOURLY"
      ? money(regularHours * configuredHourlyRate)
      : money(monthlySalary);

  const derivedMonthlyHourlyRate =
    salaryType === "MONTHLY" && monthlySalary > 0 && expectedHours > 0
      ? monthlySalary / expectedHours
      : 0;

  const overtimeHourlyRate =
    configuredHourlyRate > 0
      ? configuredHourlyRate
      : derivedMonthlyHourlyRate;

  if (
    overtimeHours > 0 &&
    profile?.overtime_eligible !== false &&
    overtimeHourlyRate <= 0
  ) {
    throw new Error(
      `Overtime hourly rate cannot be resolved for ${employee?.name || employee?.id || "employee"}`
    );
  }

  const defaultHoursPerShift = nonNegative(
    payrollSettings?.default_hours_per_shift
  );
  const leaveDailySalary =
    salaryType === "MONTHLY"
      ? monthlySalary / 30
      : configuredHourlyRate * defaultHoursPerShift;

  return {
    salaryType,
    monthlySalary,
    configuredHourlyRate,
    approvedHours,
    expectedHours,
    overtimeHours,
    regularHours,
    baseSalary,
    overtimeHourlyRate,
    leaveDailySalary,
  };
}

export async function buildPayrollRecords({
  organizationId,
  entityId,
  payrollMonth,
  payrollData = [],
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!payrollMonth) throw new Error("payrollMonth required");

  const [payrollSettings, jurisdiction] = await Promise.all([
    loadOperationalSettings({
      organizationId,
      domain: "PAYROLL",
    }),
    resolvePayrollJurisdiction({
      organizationId,
      entityId,
    }),
  ]);

  const { data: compensationProfiles, error: compensationError } = await supabase
    .from("employee_compensation_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .lte("effective_from", monthEnd(payrollMonth))
    .or(`effective_to.is.null,effective_to.gte.${payrollMonth}-01`);

  if (compensationError) throw compensationError;

  const compensationByStaff = new Map();
  for (const profile of compensationProfiles || []) {
    if (!compensationByStaff.has(profile.staff_account_id)) {
      compensationByStaff.set(profile.staff_account_id, profile);
    }
  }

  return payrollData.map((employee) => {
    const profile = compensationByStaff.get(employee.id);

    if (!profile) {
      throw new Error(`Missing compensation profile for ${employee.name || employee.id}`);
    }

    const profileCurrency = String(profile.currency || "").trim().toUpperCase();
    if (!profileCurrency || profileCurrency !== jurisdiction.currency) {
      throw new Error(
        `Compensation currency must match legal entity currency for ${employee.name || employee.id}`
      );
    }

    const payrollCountryPack = loadPayrollCountryPack(jurisdiction.country);
    const taxBrackets =
      payrollSettings?.tax_brackets || payrollCountryPack?.tax_brackets;

    if (!profile.tax_exempt && !Array.isArray(taxBrackets)) {
      throw new Error(`Missing tax configuration for ${jurisdiction.country}`);
    }

    const pay = resolveCompensationPay({
      profile,
      employee,
      payrollSettings,
    });

    const overtimePay = calculateOvertimePay({
      payrollCountryPack,
      overtimeHours: pay.overtimeHours,
      hourlyRate: pay.overtimeHourlyRate,
      overtimeEligible: profile.overtime_eligible !== false,
      isWeekend: employee.isWeekend || false,
      isHoliday: employee.isHoliday || false,
    });

    const serviceChargeBonus = nonNegative(employee.serviceChargeBonus);
    const operationalDeductions = nonNegative(employee.deductions);
    const attendancePenalty = nonNegative(employee.attendancePenalty);
    const governancePenalty = nonNegative(employee.governancePenalty);

    const leavePayout = calculateLeavePayout({
      payrollCountryPack,
      unusedLeaveDays: nonNegative(employee.unusedLeaveDays),
      dailySalary: pay.leaveDailySalary,
      leaveType: employee.leaveType || "ANNUAL",
    });

    const grossSalary = money(
      pay.baseSalary + overtimePay + serviceChargeBonus + leavePayout
    );
    const payrollIncome = money(
      pay.baseSalary + overtimePay + leavePayout
    );

    const taxAmount =
      payrollIncome <= 0 || profile.tax_exempt
        ? 0
        : calculateProgressiveTax({
            taxableIncome: payrollIncome,
            taxBrackets,
          });

    const socialSecurityRate = number(
      payrollSettings?.social_security_rate ??
        payrollCountryPack?.social_security_rate ??
        0
    );
    const maxSocialSecurity = number(
      payrollSettings?.max_social_security ??
        payrollCountryPack?.max_social_security ??
        0
    );

    const socialSecurity =
      payrollIncome <= 0 || profile.social_security_enabled === false
        ? 0
        : Math.min(
            payrollIncome * (socialSecurityRate / 100),
            maxSocialSecurity > 0 ? maxSocialSecurity : Number.MAX_SAFE_INTEGER
          );

    const totalDeductions = money(
      operationalDeductions +
        attendancePenalty +
        governancePenalty +
        taxAmount +
        socialSecurity
    );

    const finalSalary = money(grossSalary - totalDeductions);

    return {
      organization_id: organizationId,
      entity_id: entityId,
      party_id: profile.party_id || employee.partyId || null,
      staff_id: employee.id,
      staff_name: employee.name,
      role: employee.role,
      total_hours: nonNegative(employee.totalHours),
      expected_hours: pay.expectedHours,
      worked_hours: nonNegative(employee.workedHours ?? employee.totalHours),
      approved_hours: pay.approvedHours,
      variance_hours: number(employee.varianceHours, 0),
      review_required: Boolean(employee.reviewRequired || false),
      review_status: employee.reviewStatus || "NOT_REQUIRED",
      review_reason: employee.reviewReason || null,
      overtime_hours: pay.overtimeHours,
      attendance_score: nonNegative(employee.attendanceScore),
      base_salary: pay.baseSalary,
      overtime_pay: money(overtimePay),
      service_charge_bonus: serviceChargeBonus,
      leave_payout: money(leavePayout),
      deductions: totalDeductions,
      attendance_penalty: attendancePenalty,
      governance_penalty: governancePenalty,
      gross_salary: grossSalary,
      tax_amount: money(taxAmount),
      social_security: money(socialSecurity),
      final_salary: finalSalary,
      adjusted_salary: finalSalary,
      payroll_month: payrollMonth,
      completed_shifts: nonNegative(employee.completedShifts),
      missed_shifts: nonNegative(employee.missedShifts),
      late_count: nonNegative(employee.lateCount),
      total_late_minutes: nonNegative(employee.totalLateMinutes),
      department_cost_center: employee.department || null,
      payout_status: "PENDING",
      status: PAYROLL_STATUS.GENERATED,
    };
  });
}

export async function persistPayrollRecords(records = []) {
  if (!records.length) return [];

  const { data, error } = await supabase
    .from("payroll_records")
    .insert(records)
    .select();

  if (error) {
    console.error("GENERATE_PAYROLL_ERROR", error);
    throw error;
  }

  return data || [];
}

export async function generatePayrollRecords({
  organizationId,
  entityId,
  payrollMonth,
  payrollData = [],
}) {
  const records = await buildPayrollRecords({
    organizationId,
    entityId,
    payrollMonth,
    payrollData,
  });

  return persistPayrollRecords(records);
}
