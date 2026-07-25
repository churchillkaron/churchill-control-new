import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { prepareAccountingEventJournal } from "@/lib/finance/general-ledger/workflows/prepareAccountingEventJournal";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
}

function uuidOrNull(value) {
  const normalized = String(value || "").trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

export default async function postCustomerPayment({
  organization_id,
  entity_id,
  customer_id,
  customer_invoice_id,
  payment_date,
  amount,
  payment_method,
  reference_number,
  paid_by,
  currency_code = null,
  exchange_rate = null,
}) {
  const organizationId = required(
    organization_id,
    "organization_id"
  );
  const entityId = required(
    entity_id,
    "entity_id"
  );
  const invoiceId = required(
    customer_invoice_id,
    "customer_invoice_id"
  );
  const paymentDate = required(
    payment_date,
    "payment_date"
  );
  const paymentMethod = required(
    payment_method,
    "payment_method"
  );
  const paymentAmount = Number(amount || 0);

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  const { data: receivable, error: receivableError } =
    await supabaseAdmin
      .from("accounts_receivable")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("customer_invoice_id", invoiceId)
      .single();

  if (receivableError) {
    throw receivableError;
  }

  const { data: invoice, error: invoiceError } =
    await supabaseAdmin
      .from("customer_invoices")
      .select("id, organization_id, entity_id, customer_id, currency_code, exchange_rate")
      .eq("id", invoiceId)
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .single();

  if (invoiceError) {
    throw invoiceError;
  }

  const resolvedCustomerId =
    receivable.customer_id ||
    invoice.customer_id ||
    customer_id ||
    null;

  if (
    customer_id &&
    resolvedCustomerId &&
    customer_id !== resolvedCustomerId
  ) {
    throw new Error("Customer does not match the selected invoice");
  }

  const outstandingBalance = Number(
    receivable.outstanding_balance || 0
  );

  if (outstandingBalance <= 0) {
    throw new Error("Invoice has no outstanding balance");
  }

  if (paymentAmount > outstandingBalance) {
    throw new Error("Payment amount exceeds the outstanding balance");
  }

  const resolvedCurrency = String(
    currency_code ||
    invoice.currency_code ||
    ""
  )
    .trim()
    .toUpperCase();
  const resolvedExchangeRate = Number(
    exchange_rate ??
    invoice.exchange_rate ??
    1
  );

  if (!resolvedCurrency) {
    throw new Error("currency_code required");
  }

  if (!Number.isFinite(resolvedExchangeRate) || resolvedExchangeRate <= 0) {
    throw new Error("exchange_rate must be positive");
  }

  const paymentId = randomUUID();
  const createdBy = uuidOrNull(paid_by);
  const journal = await prepareAccountingEventJournal({
    event: {
      organization_id: organizationId,
      entity_id: entityId,
      event_type: "CUSTOMER_PAYMENT_RECEIVED",
      source_module: "accounts_receivable",
      source_id: paymentId,
      payload: {
        organization_id: organizationId,
        entity_id: entityId,
        party_id: resolvedCustomerId,
        customer_id: resolvedCustomerId,
        source_document: "customer_payment",
        source_document_id: paymentId,
        amount: paymentAmount,
        currency_code: resolvedCurrency,
        exchange_rate: resolvedExchangeRate,
        entryDate: paymentDate,
        description: `Customer Payment ${reference_number || paymentId}`,
      },
    },
  });

  const { data, error } = await supabaseAdmin.rpc(
    "finance_post_customer_payment_atomic",
    {
      p_payment_id: paymentId,
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_customer_id: resolvedCustomerId,
      p_customer_invoice_id: invoiceId,
      p_payment_date: paymentDate,
      p_amount: paymentAmount,
      p_payment_method: paymentMethod,
      p_reference_number: reference_number || null,
      p_paid_by: createdBy,
      p_currency_code: resolvedCurrency,
      p_exchange_rate: resolvedExchangeRate,
      p_journal_lines: journal.lines,
    }
  );

  if (error) {
    throw new Error(`Atomic customer payment failed: ${error.message}`);
  }

  return data;
}
