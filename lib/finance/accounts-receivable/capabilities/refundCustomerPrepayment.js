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

export default async function refundCustomerPrepayment({
  refund_id = null,
  organization_id,
  entity_id,
  party_id,
  payment_id,
  refund_date,
  amount,
  bank_account_id,
  reference_number = null,
  refunded_by = null,
  idempotency_key,
  system_automation = false,
}) {
  const refundId = refund_id ? uuid(refund_id, "refund_id") : randomUUID();
  const organizationId = uuid(organization_id, "organization_id");
  const entityId = uuid(entity_id, "entity_id");
  const partyId = uuid(party_id, "party_id");
  const paymentId = uuid(payment_id, "payment_id");
  const bankAccountId = uuid(bank_account_id, "bank_account_id");
  const refundedBy = uuid(refunded_by, "refunded_by", { nullable: true });
  const refundDate = dateOnly(refund_date, "refund_date");
  const refundAmount = positive(amount, "amount");
  const idempotencyKey = required(idempotency_key, "idempotency_key");

  if (!system_automation && !refundedBy) {
    throw new Error("refunded_by required for a human customer prepayment command");
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
    "finance_refund_customer_unapplied_cash_party_idempotent",
    {
      p_refund_id: refundId,
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_party_id: partyId,
      p_payment_id: paymentId,
      p_refund_date: refundDate,
      p_amount: refundAmount,
      p_bank_account_id: bankAccountId,
      p_reference_number: reference_number ? String(reference_number).trim() : null,
      p_refunded_by: refundedBy,
      p_journal_lines: journal.lines,
      p_idempotency_key: idempotencyKey,
    }
  );

  if (result.error) {
    throw new Error(`Customer prepayment refund failed: ${result.error.message}`);
  }

  return result.data;
}
