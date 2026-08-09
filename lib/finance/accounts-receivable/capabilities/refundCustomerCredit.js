import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { prepareAccountingEventJournal } from "@/lib/finance/general-ledger/workflows/prepareAccountingEventJournal";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function uuid(value, field) {
  const normalized = required(value, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(`${field} must be a UUID`);
  }
  return normalized;
}

function positiveAmount(value, field) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error(`${field} must be greater than zero`);
  }
  return normalized;
}

export default async function refundCustomerCredit({
  organization_id,
  entity_id,
  party_id,
  customer_credit_id,
  bank_account_id,
  refund_date,
  amount,
  reference_number = null,
  refunded_by,
  currency_code,
  exchange_rate,
  idempotency_key,
}) {
  const refundId = randomUUID();
  const organizationId = uuid(organization_id, "organization_id");
  const entityId = uuid(entity_id, "entity_id");
  const partyId = uuid(party_id, "party_id");
  const customerCreditId = uuid(customer_credit_id, "customer_credit_id");
  const bankAccountId = uuid(bank_account_id, "bank_account_id");
  const refundedBy = uuid(refunded_by, "refunded_by");
  const refundDate = required(refund_date, "refund_date");
  const currencyCode = required(currency_code, "currency_code").toUpperCase();
  const exchangeRate = positiveAmount(exchange_rate, "exchange_rate");
  const refundAmount = positiveAmount(amount, "amount");
  const idempotencyKey = required(idempotency_key, "idempotency_key");

  const receiptJournal = await prepareAccountingEventJournal({
    event: {
      organization_id: organizationId,
      entity_id: entityId,
      event_type: "CUSTOMER_PAYMENT_RECEIVED",
      source_module: "accounts_receivable",
      source_id: refundId,
      payload: {
        organization_id: organizationId,
        entity_id: entityId,
        party_id: partyId,
        source_document: "customer_credit_refund",
        source_document_id: refundId,
        amount: refundAmount,
        currency_code: currencyCode,
        exchange_rate: exchangeRate,
        entry_date: refundDate,
        description: `Customer Credit Refund ${reference_number || refundId}`,
      },
    },
  });

  const reversalLines = receiptJournal.lines.map((line) => ({
    ...line,
    debit: Number(line.credit || 0),
    credit: Number(line.debit || 0),
  }));

  const debitTotal = reversalLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const creditTotal = reversalLines.reduce((sum, line) => sum + Number(line.credit || 0), 0);

  if (Math.abs(debitTotal - creditTotal) > 0.005) {
    throw new Error("Customer credit refund journal is not balanced");
  }

  const { data, error } = await supabaseAdmin.rpc(
    "finance_refund_customer_credit_idempotent",
    {
      p_refund_id: refundId,
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_party_id: partyId,
      p_customer_credit_id: customerCreditId,
      p_bank_account_id: bankAccountId,
      p_refund_date: refundDate,
      p_amount: refundAmount,
      p_reference_number: reference_number || null,
      p_refunded_by: refundedBy,
      p_journal_lines: reversalLines,
      p_idempotency_key: idempotencyKey,
    }
  );

  if (error) {
    throw new Error(`Customer credit refund failed: ${error.message}`);
  }

  return data;
}
