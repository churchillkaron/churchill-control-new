import {
  PAYROLL_STATUS,
} from "@/lib/payroll/consolidation/payrollStatusMachine";
import loadPayrollCountryPack from "@/lib/payroll/countries/loadPayrollCountryPack";
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

export async function generatePayrollRecords({
  organizationId,
  entityId,
  payrollMonth,
  payrollData = [],
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!payrollMonth) throw new Error("payrollMonth required");

  const payrollSettings = await loadOperationalSettings({
    organizationId,
    domain: "PAYROLL",
  });

  const { data: compensationProfiles, error: compensationError } = await supabase
    .from("employee_compensation_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .lte("effective_from", monthEnd(payrollMonth))
    .or(`effective_to.is.null,effective_to.gte.${payrollMonth}-01`);

  if (compensationError) throw compensationError;

  const compensationByStaff = new Map(
    (compensationProfiles || []).map((profile) => [profile.staff_account_id, profile])
  );

  const records = payrollData.map((employee) => {
    const profile = compensationByStaff.get(employee.id);

    if (!profile) {
      throw new Error(`Missing compensation profile for ${employee.name || employee.id}`);
    }

    const country = profile.payroll_country || payrollSettings?.country;
    if (!country) {
      throw new Error(`Missing payroll country for ${employee.name || employee.id}`);
    }

    const payrollCountryPack = loadPayrollCountryPack(country);
    const taxBrackets =
      payrollSettings?.tax_brackets || payrollCountryPack?.tax_brackets;

    if (!profile.tax_exempt && !Array.isArray(taxBrackets)) {
      throw new Error(`Missing tax configuration for ${country}`);
    }

    const baseSalary = Number(profile.monthly_salary || employee.baseSalary || 0);
    const hourlyRate = Number(profile.hourly_rate || employee.hourlyRate || 0);

    const overtimePay = calculateOvertimePay({
      payrollCountryPack,
      overtimeHours: employee.overtimeHours || 0,
      hourlyRate,
      overtimeEligible: profile.overtime_eligible !== false,
      isWeekend: employee.isWeekend || false,
      isHoliday: employee.isHoliday || false,
    });

    const serviceChargeBonus = Number(employee.serviceChargeBonus || 0);
    const operationalDeductions = Number(employee.deductions || 0);
    const attendancePenalty = Number(employee.attendancePenalty || 0);
    const governancePenalty = Number(employee.governancePenalty || 0);

    const leavePayout = calculateLeavePayout({
      payrollCountryPack,
      unusedLeaveDays: employee.unusedLeaveDays || 0,
      dailySalary: baseSalary / 30,
      leaveType: employee.leaveType || "ANNUAL",
    });

    const grossSalary =
      baseSalary + overtimePay + serviceChargeBonus + leavePayout;
    const payrollIncome = baseSalary + overtimePay + leavePayout;

    const taxAmount =
      payrollIncome <= 0 || profile.tax_exempt
        ? 0
        : calculateProgressiveTax({
            taxableIncome: payrollIncome,
            taxBrackets,
          });

    const socialSecurityRate = Number(
      payrollSettings?.social_security_rate ??
        payrollCountryPack?.social_security_rate ??
        0
    );
    const maxSocialSecurity = Number(
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

    const totalDeductions =
      operationalDeductions +
      attendancePenalty +
      governancePenalty +
      taxAmount +
      socialSecurity;

    const finalSalary = grossSalary - totalDeductions;

    return {
      organization_id: organizationId,
      entity_id: entityId,
      party_id: profile.party_id || employee.partyId || null,
      staff_id: employee.id,
      staff_name: employee.name,
      role: employee.role,
      total_hours: Number(employee.totalHours || 0),
      expected_hours: Number(employee.expectedHours || 0),
      worked_hours: Number(employee.workedHours || employee.totalHours || 0),
      approved_hours: Number(
        employee.approvedHours || employee.workedHours || employee.totalHours || 0
      ),
      variance_hours: Number(employee.varianceHours || 0),
      review_required: Boolean(employee.reviewRequired || false),
      review_status: employee.reviewStatus || "NOT_REQUIRED",
      review_reason: employee.reviewReason || null,
      overtime_hours: Number(employee.overtimeHours || 0),
      attendance_score: Number(employee.attendanceScore || 0),
      base_salary: baseSalary,
      overtime_pay: Number(overtimePay || 0),
      service_charge_bonus: serviceChargeBonus,
      leave_payout: Number(leavePayout || 0),
      deductions: Number(totalDeductions.toFixed(2)),
      attendance_penalty: attendancePenalty,
      governance_penalty: governancePenalty,
      gross_salary: Number(grossSalary.toFixed(2)),
      tax_amount: Number(Number(taxAmount || 0).toFixed(2)),
      social_security: Number(Number(socialSecurity || 0).toFixed(2)),
      final_salary: Number(finalSalary.toFixed(2)),
      adjusted_salary: Number(finalSalary.toFixed(2)),
      payroll_month: payrollMonth,
      completed_shifts: Number(employee.completedShifts || 0),
      missed_shifts: Number(employee.missedShifts || 0),
      late_count: Number(employee.lateCount || 0),
      total_late_minutes: Number(employee.totalLateMinutes || 0),
      department_cost_center: employee.department || null,
      payout_status: "PENDING",
      status: PAYROLL_STATUS.GENERATED,
    };
  });

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
