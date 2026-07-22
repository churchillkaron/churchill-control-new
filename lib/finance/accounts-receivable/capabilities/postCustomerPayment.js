import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  financeGateway,
} from "@/lib/finance/runtime/financeGateway";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
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

  const resolvedCustomerId =
    receivable.customer_id ||
    customer_id ||
    null;

  if (
    customer_id &&
    receivable.customer_id &&
    customer_id !== receivable.customer_id
  ) {
    throw new Error(
      "Customer does not match the selected invoice"
    );
  }

  const outstandingBalance = Number(
    receivable.outstanding_balance || 0
  );

  if (outstandingBalance <= 0) {
    throw new Error("Invoice has no outstanding balance");
  }

  if (paymentAmount > outstandingBalance) {
    throw new Error(
      "Payment amount exceeds the outstanding balance"
    );
  }

  const newBalance =
    outstandingBalance - paymentAmount;

  const newStatus =
    newBalance === 0
      ? "PAID"
      : "PARTIAL";

  const { data: payment, error: paymentError } =
    await supabaseAdmin
      .from("customer_payments")
      .insert({
        organization_id: organizationId,
        entity_id: entityId,
        customer_id: resolvedCustomerId,
        customer_invoice_id: invoiceId,
        payment_date: paymentDate,
        amount: paymentAmount,
        payment_method: paymentMethod,
        reference_number,
        paid_by,
      })
      .select()
      .single();

  if (paymentError) {
    throw paymentError;
  }

  const { error: arError } = await supabaseAdmin
    .from("accounts_receivable")
    .update({
      outstanding_balance: newBalance,
      status: newStatus,
    })
    .eq("id", receivable.id)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("outstanding_balance", outstandingBalance);

  if (arError) {
    throw arError;
  }

  const { error: invoiceError } = await supabaseAdmin
    .from("customer_invoices")
    .update({
      outstanding_balance: newBalance,
      status: newStatus,
    })
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId);

  if (invoiceError) {
    throw invoiceError;
  }

  await financeGateway({
    type: "CUSTOMER_PAYMENT_RECEIVED",
    payload: {
      organization_id: organizationId,
      entity_id: entityId,
      party_id: resolvedCustomerId,
      customer_id: resolvedCustomerId,
      source_module: "accounts_receivable",
      source_id: payment.id,
      source_document: "customer_payment",
      source_document_id: payment.id,
      amount: paymentAmount,
      entryDate: paymentDate,
      description:
        `Customer Payment ${reference_number || payment.id}`,
    },
  });

  return {
    success: true,
    payment,
    outstanding_balance: newBalance,
    status: newStatus,
  };
}
