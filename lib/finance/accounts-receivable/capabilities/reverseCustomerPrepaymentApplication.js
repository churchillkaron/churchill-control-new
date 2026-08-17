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

export default async function reverseCustomerPrepaymentApplication({
  reversal_id = null,
  organization_id,
  entity_id,
  party_id,
  payment_id,
  customer_invoice_id,
  reversal_date,
  amount,
  reversed_by = null,
  idempotency_key,
  system_automation = false,
}) {
  const reversalId = reversal_id ? uuid(reversal_id, "reversal_id") : randomUUID();
  const organizationId = uuid(organization_id, "organization_id");
  const entityId = uuid(entity_id, "entity_id");
  const partyId = uuid(party_id, "party_id");
  const paymentId = uuid(payment_id, "payment_id");
  const customerInvoiceId = uuid(customer_invoice_id, "customer_invoice_id");
  const reversedBy = uuid(reversed_by, "reversed_by", { nullable: true });
  const reversalDate = dateOnly(reversal_date, "reversal_date");
  const reversalAmount = positive(amount, "amount");
  const idempotencyKey = required(idempotency_key, "idempotency_key");

  if (!system_automation && !reversedBy) {
    throw new Error("reversed_by required for a human customer prepayment reversal command");
  }

  const cashResult = await supabaseAdmin
    .from("finance_customer_unapplied_cash")
    .select("currency_code,exchange_rate")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("party_id", partyId)
    .eq("customer_payment_id", paymentId)
    .maybeSingle();

  if (cashResult.error) throw cashResult.error;
  if (!cashResult.data) throw new Error("Customer prepayment balance not found");

  const journal = await prepareCustomerPrepaymentJournal({
    organizationId,
    entityId,
    partyId,
    eventType: "CUSTOMER_UNAPPLIED_CASH_APPLIED",
    sourceId: reversalId,
    accountingDate: reversalDate,
    amount: reversalAmount,
    currencyCode: cashResult.data.currency_code,
    exchangeRate: cashResult.data.exchange_rate,
    description: `Customer prepayment application reversed from invoice ${customerInvoiceId}`,
  });

  const result = await supabaseAdmin.rpc(
    "finance_reverse_customer_unapplied_cash_application_party_idempotent",
    {
      p_reversal_id: reversalId,
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_party_id: partyId,
      p_payment_id: paymentId,
      p_customer_invoice_id: customerInvoiceId,
      p_reversal_date: reversalDate,
      p_amount: reversalAmount,
      p_reversed_by: reversedBy,
      p_journal_lines: reverseJournalLines(journal.lines),
      p_idempotency_key: idempotencyKey,
    }
  );

  if (result.error) {
    throw new Error(`Customer prepayment application reversal failed: ${result.error.message}`);
  }

  return result.data;
}