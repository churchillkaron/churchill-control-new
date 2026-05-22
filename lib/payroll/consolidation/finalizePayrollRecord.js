import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import createPayrollAuditLog
from "@/lib/payroll/audit/createPayrollAuditLog";

import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

import isPayrollImmutable
from "@/lib/payroll/consolidation/isPayrollImmutable";

export default async function finalizePayrollRecord({

  payrollRecordId,

  finalizedBy,

  role = "ACCOUNTING_ADMIN",

}) {

  const allowedRoles = [

    "OWNER",

    "ACCOUNTING_ADMIN",

    "PAYROLL_ADMIN",

  ];

  if (
    !allowedRoles.includes(
      role
    )
  ) {

    throw new Error(
      "Unauthorized payroll finalization"
    );

  }

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
  // VALIDATION
  // =========================

  if (
    isPayrollImmutable(
      record.status
    )
  ) {

    throw new Error(
      "Archived payroll is immutable"
    );

  }

  if (
    !canTransition(
      record.status,
      PAYROLL_STATUS.FINALIZED
    )
  ) {

    throw new Error(
      `Invalid payroll transition from ${record.status} to FINALIZED`
    );

  }

  if (
    record.employee_dispute &&
    !record.dispute_resolved
  ) {

    throw new Error(
      "Payroll dispute unresolved"
    );

  }

  // =========================
  // FINALIZE
  // =========================

  const {
    error: updateError,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .update({

      status:
        PAYROLL_STATUS.FINALIZED,

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
      "PAYROLL_FINALIZED",

    performedBy:
      finalizedBy,

    targetStaffId:
      record.staff_id,

    notes:
      `Payroll finalized for ${record.staff_name}`,

  });

  return {

    success: true,

  };

}
