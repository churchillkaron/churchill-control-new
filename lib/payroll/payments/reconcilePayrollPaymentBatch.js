import { resolveFinanceExchangeRate } from "@/lib/finance/currencies/FinanceExchangeRateResolver";
import { financeGateway } from "@/lib/finance/runtime/financeGateway";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function sameAmount(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= 0.01;
}

export default async function reconcilePayrollPaymentBatch({
  organizationId,
  entityId,
  payrollPaymentId,
  paymentReference,
  reconciledBy,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!payrollPaymentId) throw new Error("payrollPaymentId required");
  if (!paymentReference) throw new Error("paymentReference required");
  if (!reconciledBy) throw new Error("reconciledBy required");

  const { data: batch, error: batchError } = await supabaseAdmin
    .from("payroll_payments")
    .select("*")
    .eq("id", payrollPaymentId)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (batchError) throw batchError;
  if (!batch) throw new Error("Payroll payment batch not found for legal entity");

  if (!["PREPARED", "PROCESSING", "PAID"].includes(String(batch.status || "").toUpperCase())) {
    throw new Error(`Payroll payment batch cannot be reconciled from ${batch.status}`);
  }

  if (!batch.entity_id) throw new Error("Payroll payment legal entity required");
  if (!batch.currency) throw new Error("Payroll payment currency required");
  if (!batch.payroll_period) throw new Error("Payroll payment period required");

  const normalizedReference = String(paymentReference || "").trim();
  const existingReference = String(batch.payment_reference || "").trim();

  if (existingReference && existingReference !== normalizedReference) {
    throw new Error("Payroll payment is already associated with a different payment reference");
  }

  const resolvedReference = existingReference || normalizedReference;

  const { data: payouts, error: payoutsError } = await supabaseAdmin
    .from("payroll_payouts")
    .select("*")
    .eq("payroll_payment_id", batch.id)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  if (payoutsError) throw payoutsError;
  if (!payouts?.length) throw new Error("Payroll payment batch has no payout lines");

  const { data: records, error: recordsError } = await supabaseAdmin
    .from("payroll_records")
    .select("id,organization_id,entity_id,status,payout_status,final_salary,staff_id,party_id,staff_name,payroll_month,payment_reference,settlement_journal_entry_id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("payroll_month", batch.payroll_period)
    .order("staff_name", { ascending: true });

  if (recordsError) throw recordsError;
  if (!records?.length) throw new Error("Payroll month has no payroll records");

  if (payouts.length !== records.length) {
    throw new Error("Payroll payment batch does not cover the complete payroll month");
  }

  const recordsById = new Map(records.map((record) => [record.id, record]));
  const seenRecordIds = new Set();
  let payoutTotal = 0;

  for (const payout of payouts) {
    const record = recordsById.get(payout.payroll_record_id);

    if (!record || seenRecordIds.has(record.id)) {
      throw new Error("Payroll payment batch contains invalid or duplicate payroll records");
    }

    seenRecordIds.add(record.id);
    payoutTotal += Number(payout.amount || 0);

    if (!["LOCKED", "PAID"].includes(String(record.status || "").toUpperCase())) {
      throw new Error(
        `Payroll month must remain LOCKED or PAID during reconciliation: ${record.staff_name || record.staff_id} is ${record.status}`
      );
    }

    if (!sameAmount(record.final_salary, payout.amount)) {
      throw new Error(`Payout amount mismatch for ${record.staff_name || record.staff_id}`);
    }

    if (String(payout.currency || "").trim().toUpperCase() !== String(batch.currency || "").trim().toUpperCase()) {
      throw new Error(`Payout currency mismatch for ${record.staff_name || record.staff_id}`);
    }

    if (
      record.status === "PAID" &&
      record.payment_reference &&
      String(record.payment_reference).trim() !== resolvedReference
    ) {
      throw new Error(`Payroll record already paid with a different reference for ${record.staff_name || record.staff_id}`);
    }
  }

  if (!sameAmount(payoutTotal, batch.total_amount)) {
    throw new Error("Payroll payment batch total does not match payout lines");
  }

  const fullyPaid = records.every(
    (record) => String(record.status || "").toUpperCase() === "PAID"
  );
  const payoutsPaid = payouts.every(
    (payout) => String(payout.payout_status || "").toUpperCase() === "PAID"
  );
  const settlementJournalIds = new Set(
    records.map((record) => record.settlement_journal_entry_id).filter(Boolean)
  );

  if (
    batch.status === "PAID" &&
    fullyPaid &&
    payoutsPaid &&
    settlementJournalIds.size === 1
  ) {
    return {
      success: true,
      reused: true,
      batch,
      payouts,
      settlementJournalEntryId: [...settlementJournalIds][0],
    };
  }

  const paidAt = new Date().toISOString();
  const postingDate = paidAt.slice(0, 10);
  const exchangeRateContext = await resolveFinanceExchangeRate({
    organizationId,
    entityId,
    transactionCurrency: batch.currency,
    effectiveDate: postingDate,
  });

  const financeResult = await financeGateway({
    type: "PAYROLL_SETTLEMENT",
    payload: {
      organization_id: organizationId,
      entity_id: entityId,
      source_module: "PAYROLL",
      source_id: batch.id,
      amount: Number(batch.total_amount || 0),
      tax_amount: 0,
      currency_code: batch.currency,
      exchange_rate: exchangeRateContext.exchange_rate,
      posting_date: postingDate,
      document_date: postingDate,
      description: `Payroll settlement ${batch.payroll_period || batch.id}`,
      payroll_payment_id: batch.id,
      payment_reference: resolvedReference,
      functional_currency: exchangeRateContext.functional_currency,
      exchange_rate_source: exchangeRateContext.source,
    },
  });

  const settlementJournalEntryId =
    financeResult?.journal?.id ||
    financeResult?.ledger?.journalEntryId ||
    null;

  if (!settlementJournalEntryId) {
    throw new Error("Finance settlement did not return a journal entry id");
  }

  const conflictingSettlementReference = records.find(
    (record) =>
      record.settlement_journal_entry_id &&
      record.settlement_journal_entry_id !== settlementJournalEntryId
  );

  if (conflictingSettlementReference) {
    throw new Error(
      `Payroll record already references a different settlement journal for ${conflictingSettlementReference.staff_name || conflictingSettlementReference.staff_id}`
    );
  }

  const { error: payoutUpdateError } = await supabaseAdmin
    .from("payroll_payouts")
    .update({
      payout_reference: resolvedReference,
      reconciliation_reference: resolvedReference,
      payout_status: "PAID",
      processed_by: reconciledBy,
      processed_at: paidAt,
      reconciled_by: reconciledBy,
      reconciled_at: paidAt,
    })
    .eq("payroll_payment_id", batch.id)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId);

  if (payoutUpdateError) throw payoutUpdateError;

  const { error: recordsUpdateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      status: "PAID",
      payout_status: "PAID",
      payout_date: paidAt,
      payment_reference: resolvedReference,
      settlement_journal_entry_id: settlementJournalEntryId,
    })
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("payroll_month", batch.payroll_period)
    .eq("status", "LOCKED");

  if (recordsUpdateError) throw recordsUpdateError;

  const { data: finalRecords, error: finalRecordsError } = await supabaseAdmin
    .from("payroll_records")
    .select("id,status,payout_status,payment_reference,settlement_journal_entry_id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("payroll_month", batch.payroll_period);

  if (finalRecordsError) throw finalRecordsError;

  const incompleteRecord = (finalRecords || []).find(
    (record) =>
      record.status !== "PAID" ||
      record.payout_status !== "PAID" ||
      String(record.payment_reference || "").trim() !== resolvedReference ||
      record.settlement_journal_entry_id !== settlementJournalEntryId
  );

  if (incompleteRecord) {
    throw new Error("Payroll month payment did not complete consistently; retry reconciliation");
  }

  const { data: paidBatch, error: batchUpdateError } = await supabaseAdmin
    .from("payroll_payments")
    .update({
      payment_reference: resolvedReference,
      paid_by: String(reconciledBy),
      paid_at: batch.paid_at || paidAt,
      reconciled_by: reconciledBy,
      reconciled_at: paidAt,
      status: "PAID",
    })
    .eq("id", batch.id)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .select("*")
    .single();

  if (batchUpdateError) throw batchUpdateError;

  return {
    success: true,
    reused: false,
    batch: paidBatch,
    settlementJournalEntryId,
    payouts: payouts.map((payout) => ({
      ...payout,
      payout_reference: resolvedReference,
      reconciliation_reference: resolvedReference,
      payout_status: "PAID",
      processed_by: reconciledBy,
      processed_at: paidAt,
      reconciled_by: reconciledBy,
      reconciled_at: paidAt,
    })),
  };
}
