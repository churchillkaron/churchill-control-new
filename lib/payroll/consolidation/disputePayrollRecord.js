import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import createPayrollAuditLog
from "@/lib/payroll/audit/createPayrollAuditLog";

import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

export default async function disputePayrollRecord({

  payrollRecordId,

  staffName,

  disputeReason,

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

  if (
    !canTransition(
      record.status,
      PAYROLL_STATUS.DISPUTED
    )
  ) {

    throw new Error(
      `Invalid payroll transition from ${record.status} to DISPUTED`
    );

  }

  // =========================
  // DISPUTE
  // =========================

  const {
    error: updateError,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .update({

      employee_dispute:
        disputeReason,

      status:
        PAYROLL_STATUS.DISPUTED,

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
      "PAYROLL_DISPUTED",

    performedBy:
      staffName,

    targetStaffId:
      record.staff_id,

    notes:
      disputeReason,

  });

  return {

    success: true,

  };

}
