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

export default async function lockPayrollRecord({

  payrollRecordId,

  lockedBy,

  role = "PAYROLL_ADMIN",

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
      "Unauthorized payroll lock"
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
      PAYROLL_STATUS.LOCKED
    )
  ) {

    throw new Error(
      `Invalid payroll transition from ${record.status} to LOCKED`
    );

  }

  // =========================
  // LOCK
  // =========================

  const {
    error: updateError,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .update({

      status:
        PAYROLL_STATUS.LOCKED,

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
      "PAYROLL_RECORD_LOCKED",

    performedBy:
      lockedBy,

    targetStaffId:
      record.staff_id,

    notes:
      `Payroll locked for ${record.staff_name}`,

  });

  return {

    success: true,

  };

}
