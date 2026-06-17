import {
  PAYROLL_STATUS,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

import loadPayrollCountryPack
from "@/lib/payroll/countries/loadPayrollCountryPack";

import calculateLeavePayout
from "@/lib/payroll/leave/calculateLeavePayout";

import calculateOvertimePay
from "@/lib/payroll/overtime/calculateOvertimePay";

import calculateProgressiveTax
from "@/lib/payroll/tax/calculateProgressiveTax";

import loadOperationalSettings
from "@/lib/settings/loadOperationalSettings";

import { supabaseAdmin as supabase } from "@/lib/shared/supabase/admin";

export async function generatePayrollRecords({

  tenantId,

  payrollData = [],

  approvedBy = null,

}) {

  const payrollSettings =
    await loadOperationalSettings({

      tenantId,

      domain:
        "PAYROLL",

    });

  const payrollCountryPack =
    loadPayrollCountryPack(
      payrollSettings?.country || "Thailand"
    );

  const taxBrackets =
    payrollSettings?.tax_brackets ||
    payrollCountryPack?.tax_brackets || [
      {
        threshold: 0,
        rate: 0,
      },
      {
        threshold: 15000,
        rate: 5,
      },
      {
        threshold: 50000,
        rate: 10,
      },
      {
        threshold: 100000,
        rate: 15,
      },
    ];

  const payrollMonth =
    new Date()
      .toISOString()
      .slice(0, 7);

  const {
    data: staffProfiles,
  } = await supabase
    .from("staff_accounts")
    .select("*")
    .eq("tenant_id", tenantId);

  const records =
    payrollData.map(
      (employee) => {

        const payrollProfile =
          staffProfiles?.find(
            s => s.id === employee.id
          ) || {};

        const baseSalary =
          Number(
            payrollProfile?.monthly_salary ||
            employee.baseSalary || 0
          );

        const overtimePay =
          calculateOvertimePay({

            payrollCountryPack,

            overtimeHours:
              employee.overtimeHours || 0,

            hourlyRate:
              payrollProfile?.hourly_rate || 0,

            overtimeEligible:
              payrollProfile?.overtime_eligible !== false,

            isWeekend:
              employee.isWeekend || false,

            isHoliday:
              employee.isHoliday || false,

          });

        const serviceChargeBonus =
          Number(
            employee.serviceChargeBonus || 0
          );

        const operationalDeductions =
          Number(
            employee.deductions || 0
          );

        const attendancePenalty =
          Number(
            employee.attendancePenalty || 0
          );

        const governancePenalty =
          Number(
            employee.governancePenalty || 0
          );

        const leavePayout =
          calculateLeavePayout({

            payrollCountryPack,

            unusedLeaveDays:
              employee.unusedLeaveDays || 0,

            dailySalary:
              Number(
                payrollProfile?.monthly_salary || 0
              ) / 30,

            leaveType:
              employee.leaveType || "ANNUAL",

          });

        const grossSalary =
          baseSalary +
          overtimePay +
          serviceChargeBonus +
          leavePayout;

        const payrollIncome =
          baseSalary +
          overtimePay +
          leavePayout;

        const taxAmount =
          payrollIncome <= 0 ||
          payrollProfile?.tax_exempt

            ? 0

            :
          calculateProgressiveTax({
            taxableIncome:
              payrollIncome,

            taxBrackets,
          });

        const socialSecurity =
          payrollIncome <= 0 ||
          payrollProfile?.social_security_enabled === false

            ? 0

            :
          Math.min(
            payrollIncome *
            (
              Number(
                payrollSettings?.social_security_rate ||
                payrollCountryPack?.social_security_rate || 5
              ) / 100
            ),
            Number(
            payrollSettings?.max_social_security ||
            payrollCountryPack?.max_social_security || 750
          )
          );

        const totalDeductions =
          operationalDeductions +
          attendancePenalty +
          governancePenalty +
          taxAmount +
          socialSecurity;

        const finalSalary =
          grossSalary -
          totalDeductions;

        return {

        tenant_id:
          tenantId,

        staff_id:
          employee.id,

        staff_name:
          employee.name,

        role:
          employee.role,

        total_hours:
          Number(
            employee.totalHours || 0
          ),

        expected_hours:
          Number(
            employee.expectedHours || 0
          ),

        worked_hours:
          Number(
            employee.workedHours || employee.totalHours || 0
          ),

        approved_hours:
          Number(
            employee.approvedHours || employee.workedHours || employee.totalHours || 0
          ),

        variance_hours:
          Number(
            employee.varianceHours || 0
          ),

        review_required:
          Boolean(
            employee.reviewRequired || false
          ),

        review_status:
          employee.reviewStatus || "NOT_REQUIRED",

        review_reason:
          employee.reviewReason || null,

        overtime_hours:
          Number(
            employee.overtimeHours || 0
          ),

        attendance_score:
          Number(
            employee.attendanceScore || 0
          ),

        base_salary:
          baseSalary,

        overtime_pay:
          overtimePay,

        service_charge_bonus:
          serviceChargeBonus,

        leave_payout:
          leavePayout,

        deductions:
          totalDeductions,

        attendance_penalty:
          attendancePenalty,

        governance_penalty:
          governancePenalty,

        gross_salary:
          grossSalary,

        tax_amount:
          Number(
            taxAmount.toFixed(2)
          ),

        social_security:
          Number(
            socialSecurity.toFixed(2)
          ),

        final_salary:
          Number(
            finalSalary.toFixed(2)
          ),

        payroll_month:
          payrollMonth,

        completed_shifts:
          Number(
            employee.completedShifts || 0
          ),

        missed_shifts:
          Number(
            employee.missedShifts || 0
          ),

        late_count:
          Number(
            employee.lateCount || 0
          ),

        total_late_minutes:
          Number(
            employee.totalLateMinutes || 0
          ),

        department_cost_center:
          employee.department || null,

        payout_status:
          "PENDING",

        approved_by:
          approvedBy,

        status:
          PAYROLL_STATUS.GENERATED,
      };
    });

  const {
    data,
    error,
  } = await supabase
    .from(
      "payroll_records"
    )
    .insert(records)
    .select();

  if (error) {

    console.error(
      "GENERATE PAYROLL ERROR",
      error
    );

    throw error;
  }

  const payrollWorkflowId =
    "1782a15d-b0a5-4f0b-a38d-7d9212168d94";

  const approvalRequests =
    (data || [])

      .filter(
        record =>
          record.review_required === true
      )

      .map(
        record => ({
          tenant_id:
            tenantId,

          workflow_id:
            payrollWorkflowId,

          reference_table:
            "payroll_records",

          reference_id:
            record.id,

          requested_by:
            approvedBy,
        })
      );

  if (
    approvalRequests.length
  ) {

    const {
      error:
        approvalError,
    } = await supabase

      .from(
        "approval_requests"
      )

      .insert(
        approvalRequests
      );

    if (
      approvalError
    ) {

      console.error(
        "PAYROLL_APPROVAL_REQUEST_ERROR",
        approvalError
      );

      throw approvalError;

    }

  }

  return data;
}
