import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACCRUAL_DOCUMENTS = Object.freeze([
  "PAYROLL_NET",
  "PAYROLL_TAX",
  "PAYROLL_SOCIAL_SECURITY",
  "PAYROLL_DEDUCTION",
]);

function money(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
}

function sameAmount(left, right) {
  return Math.abs(money(left) - money(right)) <= 0.01;
}

function isActivePostedJournal(journal) {
  return Boolean(
    journal &&
      String(journal.status || "").trim().toUpperCase() === "POSTED" &&
      journal.reversed !== true &&
      !journal.reversal_journal_id
  );
}

function expectedAccrualComponents(record) {
  const tax = Math.max(0, money(record.tax_amount));
  const socialSecurity = Math.max(0, money(record.social_security));
  const deductions = Math.max(0, money(record.deductions));
  const otherDeductions = Math.max(
    0,
    money(deductions - tax - socialSecurity)
  );

  return {
    PAYROLL_NET: Math.max(0, money(record.final_salary)),
    PAYROLL_TAX: tax,
    PAYROLL_SOCIAL_SECURITY: socialSecurity,
    PAYROLL_DEDUCTION: otherDeductions,
  };
}

function journalKey(sourceDocumentId, sourceDocument) {
  return `${sourceDocumentId}:${sourceDocument}`;
}

function buildJournalTotals(lines) {
  const totals = new Map();

  for (const line of lines || []) {
    const current = totals.get(line.journal_entry_id) || {
      debit: 0,
      credit: 0,
    };

    current.debit = money(current.debit + Number(line.debit || 0));
    current.credit = money(current.credit + Number(line.credit || 0));
    totals.set(line.journal_entry_id, current);
  }

  return totals;
}

function assertJournalAmount({ journal, totals, expectedAmount, label }) {
  const total = totals.get(journal.id);

  if (!total) {
    throw new Error(`${label} has no Finance journal lines`);
  }

  if (!sameAmount(total.debit, total.credit)) {
    throw new Error(`${label} Finance journal is not balanced`);
  }

  if (!sameAmount(total.debit, expectedAmount)) {
    throw new Error(
      `${label} Finance journal amount ${money(total.debit).toFixed(2)} does not match expected ${money(expectedAmount).toFixed(2)}`
    );
  }
}

export default async function verifyPayrollFinanceEvidence({
  organizationId,
  entityId,
  payrollMonth,
  records,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!payrollMonth) throw new Error("payrollMonth required");

  const payrollRecords = Array.isArray(records) ? records : [];
  if (!payrollRecords.length) {
    throw new Error("Payroll records required for Finance evidence verification");
  }

  const recordIds = payrollRecords.map((record) => record.id).filter(Boolean);
  if (recordIds.length !== payrollRecords.length) {
    throw new Error("Payroll Finance evidence requires persisted payroll record ids");
  }

  const { data: paidBatches, error: batchError } = await supabaseAdmin
    .from("payroll_payments")
    .select(
      "id,organization_id,entity_id,payroll_period,payment_reference,total_amount,currency,status,paid_by,paid_at,reconciled_by,reconciled_at"
    )
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("payroll_period", payrollMonth)
    .eq("status", "PAID");

  if (batchError) throw batchError;

  if ((paidBatches || []).length !== 1) {
    throw new Error(
      `Payroll Finance evidence requires exactly one PAID payment batch for ${payrollMonth}`
    );
  }

  const batch = paidBatches[0];
  const paymentReference = String(batch.payment_reference || "").trim();

  if (
    !paymentReference ||
    !batch.paid_at ||
    !batch.reconciled_at ||
    !batch.reconciled_by
  ) {
    throw new Error("Payroll payment batch is missing reconciliation evidence");
  }

  const { data: payouts, error: payoutsError } = await supabaseAdmin
    .from("payroll_payouts")
    .select(
      "id,payroll_payment_id,payroll_record_id,organization_id,entity_id,payout_status,payout_reference,reconciliation_reference,amount,currency"
    )
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("payroll_payment_id", batch.id);

  if (payoutsError) throw payoutsError;

  if ((payouts || []).length !== payrollRecords.length) {
    throw new Error("Payroll payout evidence does not cover the complete payroll month");
  }

  const payoutByRecordId = new Map(
    (payouts || []).map((payout) => [payout.payroll_record_id, payout])
  );

  for (const record of payrollRecords) {
    const payout = payoutByRecordId.get(record.id);

    if (!payout) {
      throw new Error(
        `Missing payroll payout evidence for ${record.staff_name || record.staff_id || record.id}`
      );
    }

    if (
      String(record.payout_status || "").trim().toUpperCase() !== "PAID" ||
      !record.payout_date ||
      String(record.payment_reference || "").trim() !== paymentReference
    ) {
      throw new Error(
        `Payroll record payment evidence is incomplete for ${record.staff_name || record.staff_id || record.id}`
      );
    }

    if (
      String(payout.payout_status || "").trim().toUpperCase() !== "PAID" ||
      String(payout.payout_reference || "").trim() !== paymentReference ||
      String(payout.reconciliation_reference || "").trim() !== paymentReference ||
      !sameAmount(payout.amount, record.final_salary)
    ) {
      throw new Error(
        `Payroll payout reconciliation evidence is inconsistent for ${record.staff_name || record.staff_id || record.id}`
      );
    }
  }

  const { data: settlementJournals, error: settlementError } = await supabaseAdmin
    .from("journal_entries")
    .select(
      "id,organization_id,entity_id,status,reversed,reversal_journal_id,source_module,source_document,source_document_id,currency_code,exchange_rate"
    )
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("source_module", "PAYROLL")
    .eq("source_document", "PAYROLL_SETTLEMENT")
    .eq("source_document_id", batch.id);

  if (settlementError) throw settlementError;

  const activeSettlementJournals = (settlementJournals || []).filter(
    isActivePostedJournal
  );

  if (activeSettlementJournals.length !== 1) {
    throw new Error(
      `Payroll Finance evidence requires exactly one active POSTED settlement journal for ${payrollMonth}`
    );
  }

  const settlementJournal = activeSettlementJournals[0];

  if (
    String(settlementJournal.currency_code || "").trim().toUpperCase() !==
      String(batch.currency || "").trim().toUpperCase() ||
    !Number.isFinite(Number(settlementJournal.exchange_rate)) ||
    Number(settlementJournal.exchange_rate) <= 0
  ) {
    throw new Error("Payroll settlement journal currency evidence is invalid");
  }

  for (const record of payrollRecords) {
    if (
      record.settlement_journal_entry_id &&
      record.settlement_journal_entry_id !== settlementJournal.id
    ) {
      throw new Error(
        `Payroll settlement journal reference is inconsistent for ${record.staff_name || record.staff_id || record.id}`
      );
    }
  }

  const { data: accrualJournals, error: accrualError } = await supabaseAdmin
    .from("journal_entries")
    .select(
      "id,organization_id,entity_id,status,reversed,reversal_journal_id,source_module,source_document,source_document_id,currency_code,exchange_rate"
    )
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("source_module", "PAYROLL")
    .in("source_document", ACCRUAL_DOCUMENTS)
    .in("source_document_id", recordIds);

  if (accrualError) throw accrualError;

  const activeAccrualsByKey = new Map();

  for (const journal of accrualJournals || []) {
    if (!isActivePostedJournal(journal)) continue;

    const key = journalKey(journal.source_document_id, journal.source_document);
    const entries = activeAccrualsByKey.get(key) || [];
    entries.push(journal);
    activeAccrualsByKey.set(key, entries);
  }

  const expectedJournalAmounts = new Map();
  const verifiedAccrualJournals = [];

  for (const record of payrollRecords) {
    const expected = expectedAccrualComponents(record);

    for (const documentType of ACCRUAL_DOCUMENTS) {
      const amount = expected[documentType];
      const journals =
        activeAccrualsByKey.get(journalKey(record.id, documentType)) || [];

      if (amount > 0 && journals.length !== 1) {
        throw new Error(
          `${documentType} requires exactly one active POSTED Finance journal for ${record.staff_name || record.staff_id || record.id}`
        );
      }

      if (amount <= 0 && journals.length > 0) {
        throw new Error(
          `${documentType} Finance journal exists without a matching payroll amount for ${record.staff_name || record.staff_id || record.id}`
        );
      }

      if (journals.length === 1) {
        const journal = journals[0];

        if (
          !Number.isFinite(Number(journal.exchange_rate)) ||
          Number(journal.exchange_rate) <= 0
        ) {
          throw new Error(`${documentType} Finance journal has an invalid exchange rate`);
        }

        expectedJournalAmounts.set(journal.id, {
          amount,
          label: `${documentType} for ${record.staff_name || record.staff_id || record.id}`,
        });
        verifiedAccrualJournals.push(journal);
      }
    }
  }

  expectedJournalAmounts.set(settlementJournal.id, {
    amount: money(batch.total_amount),
    label: `PAYROLL_SETTLEMENT for ${payrollMonth}`,
  });

  const journalIds = [...expectedJournalAmounts.keys()];
  const { data: journalLines, error: lineError } = await supabaseAdmin
    .from("journal_entry_lines")
    .select("journal_entry_id,debit,credit")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .in("journal_entry_id", journalIds);

  if (lineError) throw lineError;

  const journalTotals = buildJournalTotals(journalLines || []);

  for (const [journalId, expected] of expectedJournalAmounts.entries()) {
    assertJournalAmount({
      journal: { id: journalId },
      totals: journalTotals,
      expectedAmount: expected.amount,
      label: expected.label,
    });
  }

  return {
    success: true,
    batch,
    settlementJournal,
    accrualJournals: verifiedAccrualJournals,
  };
}
