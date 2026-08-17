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

export default async function applyCustomerPrepayment({
  application_id = null,
  organization_id,
  entity_id,
  party_id,
  payment_id,
  customer_invoice_id,
  application_date,
  amount,
  applied_by = null,
  idempotency_key,
  system_automation = false,
}) {
  const applicationId = application_id ? uuid(application_id, "application_id") : randomUUID();
  const organizationId = uuid(organization_id, "organization_id");
  const entityId = uuid(entity_id, "entity_id");
  const partyId = uuid(party_id, "party_id");
  const paymentId = uuid(payment_id, "payment_id");
  const customerInvoiceId = uuid(customer_invoice_id, "customer_invoice_id");
  const appliedBy = uuid(applied_by, "applied_by", { nullable: true });
  const applicationDate = dateOnly(application_date, "application_date");
  const applicationAmount = positive(amount, "amount");
  const idempotencyKey = required(idempotency_key, "idempotency_key");

  if (!system_automation && !appliedBy) {
    throw new Error("applied_by required for a human customer prepayment command");
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
    sourceId: applicationId,
    accountingDate: applicationDate,
    amount: applicationAmount,
    currencyCode: cashResult.data.currency_code,
    exchangeRate: cashResult.data.exchange_rate,
    description: `Customer prepayment applied to invoice ${customerInvoiceId}`,
  });

  const result = await supabaseAdmin.rpc(
    "finance_apply_customer_unapplied_cash_party_idempotent",
    {
      p_application_id: applicationId,
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_party_id: partyId,
      p_payment_id: paymentId,
      p_customer_invoice_id: customerInvoiceId,
      p_application_date: applicationDate,
      p_amount: applicationAmount,
      p_applied_by: appliedBy,
      p_journal_lines: journal.lines,
      p_idempotency_key: idempotencyKey,
    }
  );

  if (result.error) {
    throw new Error(`Customer prepayment application failed: ${result.error.message}`);
  }

  return result.data;
}
