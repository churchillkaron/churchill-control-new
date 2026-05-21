import { supabase } from "@/lib/shared/supabase/client";

export async function generatePayrollRecords({

  tenantId,

  payrollData = [],

  approvedBy = null,

}) {

  const payrollMonth =
    new Date()
      .toISOString()
      .slice(0, 7);

  const records =
    payrollData.map(
      (employee) => ({

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

        overtime_hours:
          Number(
            employee.overtimeHours || 0
          ),

        attendance_score:
          Number(
            employee.attendanceScore || 0
          ),

        base_salary:
          Number(
            employee.baseSalary || 0
          ),

        overtime_pay:
          Number(
            employee.overtimePay || 0
          ),

        service_charge_bonus:
          Number(
            employee.serviceChargeBonus || 0
          ),

        deductions:
          Number(
            employee.deductions || 0
          ),

        final_salary:
          Number(
            employee.finalSalary || 0
          ),

        payroll_month:
          payrollMonth,

        payout_status:
          "PENDING",

        approved_by:
          approvedBy,

        status:
          "GENERATED",
      })
    );

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

  return data;
}
