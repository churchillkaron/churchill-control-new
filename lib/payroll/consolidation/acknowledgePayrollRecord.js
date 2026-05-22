import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import createPayrollAuditLog
from "@/lib/payroll/audit/createPayrollAuditLog";

export default async function acknowledgePayrollRecord({

  payrollRecordId,

  staffName,

}) {

  // =========================
  // LOAD RECORD
  // =========================

  const {
    data: record,
    error: recordError,
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

  if (recordError) {
    throw recordError;
  }

  // =========================
  // ACKNOWLEDGE
  // =========================

  const {
    error: updateError,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .update({

      employee_acknowledged:
        true,

      employee_acknowledged_at:
        new Date().toISOString(),

    })

    .eq(
      "id",
      payrollRecordId
    );

  if (updateError) {
    throw updateError;
  }

  // =========================
  // AUDIT
  // =========================

  await createPayrollAuditLog({

    tenantId:
      record.tenant_id,

    payrollPeriod:
      record.payroll_month,

    action:
      "PAYROLL_ACKNOWLEDGED",

    performedBy:
      staffName,

    targetStaffId:
      record.staff_id,

    notes:
      `Payroll acknowledged by ${staffName}`,

  });

  return {

    success: true,

  };

}
