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

function positiveAmount(value, field) {
  const normalized = Number(value);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error(`${field} must be greater than zero`);
  }

  return normalized;
}

function uuid(value, field) {
  const normalized = required(value, field);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(`${field} must be a UUID`);
  }

  return normalized;
}

function normalizeAllocations({ allocations, customerInvoiceId, amount }) {
  const source = Array.isArray(allocations) && allocations.length
    ? allocations
    : customerInvoiceId
      ? [{ customer_invoice_id: customerInvoiceId, amount }]
      : [];

  const seen = new Set();

  return source.map((allocation, index) => {
    const customerInvoiceId = uuid(
      allocation?.customer_invoice_id || allocation?.customerInvoiceId,
      `allocation ${index + 1} customer_invoice_id`
    );
    const allocationAmount = positiveAmount(
      allocation?.amount,
      `allocation ${index + 1} amount`
    );

    if (seen.has(customerInvoiceId)) {
      throw new Error("Each customer invoice can appear only once in allocations");
    }

    seen.add(customerInvoiceId);

    return {
      customer_invoice_id: customerInvoiceId,
      amount: allocationAmount,
    };
  });
}

export default async function postCustomerPayment({
  organization_id,
  entity_id,
  customer_id,
  customer_invoice_id = null,
  allocations = [],
  payment_date,
  amount,
  bank_account_id,
  payment_method,
  reference_number = null,
  paid_by,
  currency_code,
  exchange_rate,
  idempotency_key,
}) {
  const organizationId = uuid(organization_id, "organization_id");
  const entityId = uuid(entity_id, "entity_id");
  const customerId = uuid(customer_id, "customer_id");
  const bankAccountId = uuid(bank_account_id, "bank_account_id");
  const paidBy = uuid(paid_by, "paid_by");
  const paymentDate = required(payment_date, "payment_date");
  const paymentMethod = required(payment_method, "payment_method");
  const currencyCode = required(currency_code, "currency_code").toUpperCase();
  const idempotencyKey = required(idempotency_key, "idempotency_key");
  const paymentAmount = positiveAmount(amount, "payment amount");
  const exchangeRate = positiveAmount(exchange_rate, "exchange_rate");
  const normalizedAllocations = normalizeAllocations({
    allocations,
    customerInvoiceId: customer_invoice_id,
    amount: paymentAmount,
  });
  const allocatedAmount = normalizedAllocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0
  );

  if (allocatedAmount > paymentAmount + 0.005) {
    throw new Error("Allocated amount exceeds payment amount");
  }

  const paymentId = randomUUID();
  const journal = await prepareAccountingEventJournal({
    event: {
      organization_id: organizationId,
      entity_id: entityId,
      event_type: "CUSTOMER_RECEIPT_POSTED",
      source_module: "accounts_receivable",
      source_id: paymentId,
      payload: {
        organization_id: organizationId,
        entity_id: entityId,
        party_id: customerId,
        customer_id: customerId,
        source_document: "customer_payment",
        source_document_id: paymentId,
        amount: paymentAmount,
        allocated_amount: allocatedAmount,
        unapplied_amount: paymentAmount - allocatedAmount,
        currency_code: currencyCode,
        exchange_rate: exchangeRate,
        entry_date: paymentDate,
        description: `Customer Receipt ${reference_number || paymentId}`,
      },
    },
  });

  const { data, error } = await supabaseAdmin.rpc(
    "finance_post_customer_receipt_allocation_idempotent",
    {
      p_payment_id: paymentId,
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_customer_id: customerId,
      p_payment_date: paymentDate,
      p_payment_amount: paymentAmount,
      p_bank_account_id: bankAccountId,
      p_payment_method: paymentMethod,
      p_reference_number: reference_number || null,
      p_paid_by: paidBy,
      p_currency_code: currencyCode,
      p_exchange_rate: exchangeRate,
      p_allocations: normalizedAllocations,
      p_journal_lines: journal.lines,
      p_idempotency_key: idempotencyKey,
    }
  );

  if (error) {
    throw new Error(`Customer receipt allocation failed: ${error.message}`);
  }

  return data;
}
