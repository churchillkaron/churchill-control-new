import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function generatePayslip({

  payrollRecordId,

}) {

  // =========================
  // LOAD PAYROLL RECORD
  // =========================

  const {
    data: record,
    error,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .select("*")

    .eq(
      "id",
      payrollRecordId
    )

    .single();

  if (error) {
    throw error;
  }

  return {

    employee:
      record.staff_name,

    payroll_month:
      record.payroll_month,

    role:
      record.role,

    base_salary:
      record.base_salary,

    overtime_hours:
      record.overtime_hours,

    overtime_pay:
      record.overtime_pay,

    service_charge_bonus:
      record.service_charge_bonus,

    deductions:
      record.deductions,

    final_salary:
      record.final_salary,

    attendance_score:
      record.attendance_score,

    payout_status:
      record.payout_status,

    generated_at:
      new Date().toISOString(),

  };

}
