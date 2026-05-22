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

export default async function closePayrollAccountingPeriod({

  payrollRecordId,

  closedBy,

  role = "ACCOUNTING_ADMIN",

}) {

  const allowedRoles = [

    "OWNER",

    "ACCOUNTING_ADMIN",

  ];

  if (
    !allowedRoles.includes(
      role
    )
  ) {

    throw new Error(
      "Unauthorized accounting close"
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
      PAYROLL_STATUS.ACCOUNTING_CLOSED
    )
  ) {

    throw new Error(
      `Invalid payroll transition from ${record.status} to ACCOUNTING_CLOSED`
    );

  }

  // =========================
  // CLOSE PERIOD
  // =========================

  const {
    error: updateError,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .update({

      accounting_period_closed:
        true,

      accounting_period_closed_at:
        new Date().toISOString(),

      accounting_period_closed_by:
        closedBy,

      status:
        PAYROLL_STATUS.ACCOUNTING_CLOSED,

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
      "PAYROLL_ACCOUNTING_PERIOD_CLOSED",

    performedBy:
      closedBy,

    targetStaffId:
      record.staff_id,

    notes:
      `Accounting period closed for ${record.staff_name}`,

  });

  return {

    success: true,

  };

}
