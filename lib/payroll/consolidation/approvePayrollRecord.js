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

import createPayrollJournalEntry
from "@/lib/payroll/accounting/createPayrollJournalEntry";

export default async function approvePayrollRecord({

  payrollRecordId,

  approvedBy,

  role = "MANAGER",

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
      "Unauthorized payroll approval"
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
      PAYROLL_STATUS.APPROVED
    )
  ) {

    throw new Error(
      `Invalid payroll transition from ${record.status} to APPROVED`
    );

  }

  // =========================
  // APPROVE
  // =========================

  const {
    error: updateError,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .update({

      status:
        PAYROLL_STATUS.APPROVED,

      approved_by:
        approvedBy,

      approved_at:
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

  await createPayrollJournalEntry({

    payrollRecord: {

      ...record,

      status:
        PAYROLL_STATUS.APPROVED,

    },

    postingType:
      "PAYROLL_ACCRUAL",

  });

  await createPayrollAuditLog({

    tenantId:
      record.tenant_id,

    payrollPeriod:
      record.payroll_month,

    action:
      "PAYROLL_RECORD_APPROVED",

    performedBy:
      approvedBy,

    targetStaffId:
      record.staff_id,

    notes:
      `Payroll approved for ${record.staff_name}`,

  });

  return {

    success: true,

  };

}
