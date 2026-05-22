import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import createPayrollAuditLog
from "@/lib/payroll/audit/createPayrollAuditLog";

export default async function executePayrollPayment({

  tenantId,

  payrollPeriod,

  paymentReference = "",

  paymentMethod = "BANK",

  totalAmount = 0,

  paidBy = "SYSTEM",

  notes = "",

}) {

  // =========================
  // DUPLICATE CHECK
  // =========================

  const {
    data: existingPayment,
  } = await supabaseAdmin

    .from(
      "payroll_payments"
    )

    .select("id")

    .eq(
      "tenant_id",
      tenantId
    )

    .eq(
      "payroll_period",
      payrollPeriod
    )

    .limit(1);

  if (
    existingPayment &&
    existingPayment.length > 0
  ) {

    throw new Error(
      "Payroll already paid"
    );

  }

  // =========================
  // CREATE PAYMENT
  // =========================

  const {
    error,
  } = await supabaseAdmin

    .from(
      "payroll_payments"
    )

    .insert({

      tenant_id:
        tenantId,

      payroll_period:
        payrollPeriod,

      payment_reference:
        paymentReference,

      payment_method:
        paymentMethod,

      total_amount:
        totalAmount,

      paid_by:
        paidBy,

      paid_at:
        new Date().toISOString(),

      notes,

    });

  if (error) {
    throw error;
  }

  // =========================
  // AUDIT
  // =========================

  await createPayrollAuditLog({

    tenantId,

    payrollPeriod,

    action:
      "PAYROLL_PAYMENT_EXECUTED",

    performedBy:
      paidBy,

    notes:
      `Payroll payment executed via ${paymentMethod}`,

  });

  // =========================
  // ACCOUNTING JOURNAL
  // =========================

  const journalEntries = [

    {

      account:
        "Payroll Payable",

      type:
        "DEBIT",

      amount:
        totalAmount,

    },

    {

      account:
        "Cash / Bank",

      type:
        "CREDIT",

      amount:
        totalAmount,

    },

  ];

  return {

    success: true,

    journal_entries:
      journalEntries,

  };

}
