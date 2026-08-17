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

export default async function postCustomerPrepayment({
  payment_id = null,
  organization_id,
  entity_id,
  party_id,
  payment_date,
  amount,
  bank_account_id,
  payment_method,
  reference_number = null,
  received_by = null,
  currency_code,
  exchange_rate,
  idempotency_key,
  system_automation = false,
}) {
  const organizationId = uuid(organization_id, "organization_id");
  const entityId = uuid(entity_id, "entity_id");
  const partyId = uuid(party_id, "party_id");
  const bankAccountId = uuid(bank_account_id, "bank_account_id");
  const receivedBy = uuid(received_by, "received_by", { nullable: true });
  const paymentId = payment_id ? uuid(payment_id, "payment_id") : randomUUID();
  const paymentDate = dateOnly(payment_date, "payment_date");
  const paymentAmount = positive(amount, "amount");
  const exchangeRate = positive(exchange_rate, "exchange_rate");
  const currencyCode = required(currency_code, "currency_code").toUpperCase();
  const paymentMethod = required(payment_method, "payment_method").toUpperCase();
  const idempotencyKey = required(idempotency_key, "idempotency_key");

  if (!system_automation && !receivedBy) {
    throw new Error("received_by required for a human customer prepayment command");
  }

  const journal = await prepareCustomerPrepaymentJournal({
    organizationId,
    entityId,
    partyId,
    eventType: "CUSTOMER_UNAPPLIED_CASH_RECEIVED",
    sourceId: paymentId,
    accountingDate: paymentDate,
    amount: paymentAmount,
    currencyCode,
    exchangeRate,
    description: `Customer prepayment ${reference_number || paymentId}`,
    bankAccountId,
    bankSide: "DEBIT",
  });

  const result = await supabaseAdmin.rpc(
    "finance_post_customer_prepayment_party_idempotent",
    {
      p_payment_id: paymentId,
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_party_id: partyId,
      p_payment_date: paymentDate,
      p_payment_amount: paymentAmount,
      p_bank_account_id: bankAccountId,
      p_payment_method: paymentMethod,
      p_reference_number: reference_number ? String(reference_number).trim() : null,
      p_received_by: receivedBy,
      p_currency_code: currencyCode,
      p_exchange_rate: exchangeRate,
      p_journal_lines: journal.lines,
      p_idempotency_key: idempotencyKey,
    }
  );

  if (result.error) {
    throw new Error(`Customer prepayment posting failed: ${result.error.message}`);
  }

  return result.data;
}
