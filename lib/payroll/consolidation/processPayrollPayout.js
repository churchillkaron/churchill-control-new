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

export default async function processPayrollPayout({

  payrollRecordId,

  paymentMethod = "BANK",

  processedBy = "PAYROLL_ADMIN",

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
      "Unauthorized payroll payout"
    );

  }

  // =========================
  // LOAD PAYROLL RECORD
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
  // LOCK CHECK
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
      PAYROLL_STATUS.PAID
    )
  ) {

    throw new Error(
      `Invalid payroll transition from ${record.status} to PAID`
    );

  }

  // =========================
  // DUPLICATE CHECK
  // =========================

  const {
    data: existing,
  } = await supabaseAdmin

    .from(
      "payroll_payouts"
    )

    .select("id")

    .eq(
      "payroll_record_id",
      payrollRecordId
    )

    .limit(1);

  if (
    existing &&
    existing.length > 0
  ) {

    throw new Error(
      "Payroll already paid"
    );

  }

  // =========================
  // CREATE PAYOUT
  // =========================

  const payoutReference =
    `PAY-${Date.now()}`;

  const {
    error: payoutError,
  } = await supabaseAdmin

    .from(
      "payroll_payouts"
    )

    .insert({

      tenant_id:
        record.tenant_id,

      payroll_record_id:
        payrollRecordId,

      staff_id:
        record.staff_id,

      staff_name:
        record.staff_name,

      amount:
        record.final_salary,

      payment_method:
        paymentMethod,

      payout_reference:
        payoutReference,

      payout_status:
        PAYROLL_STATUS.PAID,

      processed_by:
        processedBy,

      processed_at:
        new Date().toISOString(),

    });

  if (payoutError) {
    throw payoutError;
  }

  // =========================
  // UPDATE PAYROLL RECORD
  // =========================

  await supabaseAdmin

    .from(
      "payroll_records"
    )

    .update({

      payout_status:
        PAYROLL_STATUS.PAID,

      payout_date:
        new Date().toISOString(),

      payment_reference:
        payoutReference,

      status:
        PAYROLL_STATUS.PAID,

    })

    .eq(
      "id",
      payrollRecordId
    );

  // =========================
  // AUDIT
  // =========================

  await createPayrollJournalEntry({

    payrollRecord: {

      ...record,

      status:
        PAYROLL_STATUS.PAID,

    },

    postingType:
      "PAYROLL_SETTLEMENT",

  });

  await createPayrollAuditLog({

    tenantId:
      record.tenant_id,

    payrollPeriod:
      record.payroll_month,

    action:
      "PAYROLL_PAYOUT_EXECUTED",

    performedBy:
      processedBy,

    targetStaffId:
      record.staff_id,

    notes:
      `Payroll payout executed for ${record.staff_name}`,

  });

  return {

    success: true,

    payout_reference:
      payoutReference,

  };

}
