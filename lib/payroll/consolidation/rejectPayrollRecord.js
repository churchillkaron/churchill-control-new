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

export default async function rejectPayrollRecord({

  payrollRecordId,

  rejectedBy,

  role = "MANAGER",

  reason = "",

}) {

  const allowedRoles = [

    "OWNER",

    "ACCOUNTING_ADMIN",

    "PAYROLL_ADMIN",

    "MANAGER",

  ];

  if (
    !allowedRoles.includes(
      role
    )
  ) {

    throw new Error(
      "Unauthorized payroll rejection"
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
      PAYROLL_STATUS.REJECTED
    )
  ) {

    throw new Error(
      `Invalid payroll transition from ${record.status} to REJECTED`
    );

  }

  // =========================
  // REJECT
  // =========================

  const {
    error: updateError,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .update({

      status:
        PAYROLL_STATUS.REJECTED,

      notes:
        reason,

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
      "PAYROLL_RECORD_REJECTED",

    performedBy:
      rejectedBy,

    targetStaffId:
      record.staff_id,

    notes:
      reason ||

      `Payroll rejected for ${record.staff_name}`,

  });

  return {

    success: true,

  };

}
