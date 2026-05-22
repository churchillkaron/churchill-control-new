import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import createPayrollAuditLog
from "@/lib/payroll/audit/createPayrollAuditLog";

import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

import reversePayrollJournal
from "@/lib/payroll/accounting/reversePayrollJournal";

import createPayrollJournalEntry
from "@/lib/payroll/accounting/createPayrollJournalEntry";

import isPayrollImmutable
from "@/lib/payroll/consolidation/isPayrollImmutable";

export default async function recalculatePayrollRecord({

  payrollRecordId,

  recalculatedBy,

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
      "Unauthorized payroll recalculation"
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
      PAYROLL_STATUS.RECALCULATED
    )
  ) {

    throw new Error(
      `Invalid payroll transition from ${record.status} to RECALCULATED`
    );

  }

  // =========================
  // REVERSE OLD ACCOUNTING
  // =========================

  if (
    record.accrual_journal_entry_id
  ) {

    await reversePayrollJournal({

      payrollRecordId,

      type:
        "ACCRUAL",

      reason:
        "Payroll recalculation",

    });

  }

  if (
    record.settlement_journal_entry_id
  ) {

    await reversePayrollJournal({

      payrollRecordId,

      type:
        "SETTLEMENT",

      reason:
        "Payroll recalculation",

    });

  }

  // =========================
  // RECALCULATE
  // =========================

  const recalculatedSalary =
    Number(
      record.base_salary || 0
    ) +

    Number(
      record.overtime_pay || 0
    ) +

    Number(
      record.service_charge_bonus || 0
    ) -

    Number(
      record.deductions || 0
    );

  const {
    error: updateError,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .update({

      final_salary:
        Number(
          recalculatedSalary.toFixed(2)
        ),

      status:
        PAYROLL_STATUS.RECALCULATED,

    })

    .eq(
      "id",
      payrollRecordId
    );

  if (updateError) {
    throw updateError;
  }

  // =========================
  // CREATE NEW ACCRUAL
  // =========================

  await createPayrollJournalEntry({

    payrollRecord: {

      ...record,

      final_salary:
        Number(
          recalculatedSalary.toFixed(2)
        ),

    },

    postingType:
      "PAYROLL_ACCRUAL",

  });

  // =========================
  // AUDIT
  // =========================

  await createPayrollAuditLog({

    tenantId:
      record.tenant_id,

    payrollPeriod:
      record.payroll_month,

    action:
      "PAYROLL_RECORD_RECALCULATED",

    performedBy:
      recalculatedBy,

    targetStaffId:
      record.staff_id,

    notes:
      `Payroll recalculated for ${record.staff_name}`,

  });

  return {

    success: true,

  };

}
