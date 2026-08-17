import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { prepareCustomerPrepaymentJournal } from "../runtime/customerPrepaymentAccounting";

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function uuid(value, field, { nullable = false } = {}) {
  if ((value === null || value === undefined || value === "") && nullable) return null;
  const normalized = required(value, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(`${field} must be a UUID`);
  }
  return normalized;
}

function positive(value, field) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error(`${field} must be greater than zero`);
  }
  return normalized;
}

function dateOnly(value, field) {
  const normalized = required(value, field);
  const candidate = new Date(`${normalized.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(candidate.getTime())) throw new Error(`${field} must be a valid date`);
  return candidate.toISOString().slice(0, 10);
}

function reverseJournalLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((line) => ({
    ...line,
    debit: Number(line?.credit || 0),
    credit: Number(line?.debit || 0),
  }));
}

export default async function refundCustomerPrepaymentAgainstInvoice({
  operation_id = null,
  reversal_id = null,
  credit_note_id = null,
  refund_id = null,
  organization_id,
  entity_id,
  party_id,
  payment_id,
  customer_invoice_id,
  refund_date,
  amount,
  bank_account_id,
  reference_number = null,
  reason = null,
  actor_id = null,
  idempotency_key,
  system_automation = false,
}) {
  const operationId = operation_id ? uuid(operation_id, "operation_id") : randomUUID();
  const reversalId = reversal_id ? uuid(reversal_id, "reversal_id") : randomUUID();
  const creditNoteId = credit_note_id ? uuid(credit_note_id, "credit_note_id") : randomUUID();
  const refundId = refund_id ? uuid(refund_id, "refund_id") : randomUUID();
  const organizationId = uuid(organization_id, "organization_id");
  const entityId = uuid(entity_id, "entity_id");
  const partyId = uuid(party_id, "party_id");
  const paymentId = uuid(payment_id, "payment_id");
  const customerInvoiceId = uuid(customer_invoice_id, "customer_invoice_id");
  const bankAccountId = uuid(bank_account_id, "bank_account_id");
  const actorId = uuid(actor_id, "actor_id", { nullable: true });
  const refundDate = dateOnly(refund_date, "refund_date");
  const refundAmount = positive(amount, "amount");
  const idempotencyKey = required(idempotency_key, "idempotency_key");

  if (!system_automation && !actorId) {
    throw new Error("actor_id required for a human customer prepayment refund command");
  }

  const cashResult = await supabaseAdmin
    .from("finance_customer_unapplied_cash")
    .select("currency_code,exchange_rate,available_amount")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("party_id", partyId)
    .eq("customer_payment_id", paymentId)
    .maybeSingle();

  if (cashResult.error) throw cashResult.error;
  if (!cashResult.data) throw new Error("Customer prepayment balance not found");

  const allocationResult = await supabaseAdmin
    .from("finance_customer_payment_allocations")
    .select("allocated_amount,reversed_amount")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("party_id", partyId)
    .eq("customer_payment_id", paymentId)
    .eq("customer_invoice_id", customerInvoiceId)
    .maybeSingle();

  if (allocationResult.error) throw allocationResult.error;

  const availableAmount = Math.max(Number(cashResult.data.available_amount || 0), 0);
  const appliedAmount = Math.max(
    Number(allocationResult.data?.allocated_amount || 0) -
      Number(allocationResult.data?.reversed_amount || 0),
    0
  );
  const availableComponent = Math.min(availableAmount, refundAmount);
  const appliedComponent = Math.max(refundAmount - availableComponent, 0);

  if (appliedComponent > appliedAmount + 0.005) {
    throw new Error("Refund amount exceeds available and applied customer prepayment balance");
  }

  let reversalLines = [];
  if (appliedComponent > 0.005) {
    const applicationJournal = await prepareCustomerPrepaymentJournal({
      organizationId,
      entityId,
      partyId,
      eventType: "CUSTOMER_UNAPPLIED_CASH_APPLIED",
      sourceId: reversalId,
      accountingDate: refundDate,
      amount: appliedComponent,
      currencyCode: cashResult.data.currency_code,
      exchangeRate: cashResult.data.exchange_rate,
      description: `Customer prepayment application reversed for refund ${reference_number || refundId}`,
    });
    reversalLines = reverseJournalLines(applicationJournal.lines);
  }

  const refundJournal = await prepareCustomerPrepaymentJournal({
    organizationId,
    entityId,
    partyId,
    eventType: "CUSTOMER_UNAPPLIED_CASH_REFUNDED",
    sourceId: refundId,
    accountingDate: refundDate,
    amount: refundAmount,
    currencyCode: cashResult.data.currency_code,
    exchangeRate: cashResult.data.exchange_rate,
    description: `Customer prepayment refund ${reference_number || refundId}`,
    bankAccountId,
    bankSide: "CREDIT",
  });

  const result = await supabaseAdmin.rpc(
    "finance_refund_customer_prepayment_against_invoice_idempotent",
    {
      p_operation_id: operationId,
      p_reversal_id: reversalId,
      p_credit_note_id: creditNoteId,
      p_refund_id: refundId,
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_party_id: partyId,
      p_payment_id: paymentId,
      p_customer_invoice_id: customerInvoiceId,
      p_refund_date: refundDate,
      p_amount: refundAmount,
      p_expected_applied_amount: appliedComponent,
      p_bank_account_id: bankAccountId,
      p_reference_number: reference_number ? String(reference_number).trim() : null,
      p_reason: reason ? String(reason).trim() : null,
      p_actor_id: actorId,
      p_reversal_journal_lines: reversalLines,
      p_refund_journal_lines: refundJournal.lines,
      p_idempotency_key: idempotencyKey,
    }
  );

  if (result.error) {
    throw new Error(`Customer prepayment invoice refund failed: ${result.error.message}`);
  }

  return result.data;
}