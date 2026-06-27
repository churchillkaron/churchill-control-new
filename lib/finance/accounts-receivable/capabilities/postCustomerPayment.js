import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!entity_id) {
    throw new Error("entity_id required");
  }

  if (!customer_invoice_id) {
    throw new Error("customer_invoice_id required");
  }

  const paymentAmount =
    Number(amount || 0);

  if (paymentAmount <= 0) {
    throw new Error("Payment amount required");
  }

  const {
    data: receivable,
    error: receivableError,
  } = await supabaseAdmin
    .from("accounts_receivable")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("entity_id", entity_id)
    .eq("customer_invoice_id", customer_invoice_id)
    .single();

  if (receivableError) {
    throw receivableError;
  }

  const newBalance =
    Math.max(
      0,
      Number(receivable.outstanding_balance || 0) -
        paymentAmount
    );

  const newStatus =
    newBalance === 0
      ? "PAID"
      : "PARTIAL";

  const {
    data: payment,
    error: paymentError,
  } = await supabaseAdmin
    .from("customer_payments")
    .insert({
      organization_id,
      entity_id,
      customer_id,
      customer_invoice_id,
      payment_date,
      amount: paymentAmount,
      payment_method,
      reference_number,
      paid_by,
    })
    .select()
    .single();

  if (paymentError) {
    throw paymentError;
  }

  const {
    error: arError,
  } = await supabaseAdmin
    .from("accounts_receivable")
    .update({
      outstanding_balance: newBalance,
      status: newStatus,
    })
    .eq("id", receivable.id)
    .eq("organization_id", organization_id)
    .eq("entity_id", entity_id);

  if (arError) {
    throw arError;
  }

  const {
    error: invoiceError,
  } = await supabaseAdmin
    .from("customer_invoices")
    .update({
      outstanding_balance: newBalance,
      status: newStatus,
    })
    .eq("id", customer_invoice_id)
    .eq("organization_id", organization_id)
    .eq("entity_id", entity_id);

  if (invoiceError) {
    throw invoiceError;
  }

  return {
    success: true,
    payment,
    outstanding_balance: newBalance,
    status: newStatus,
  };
}
