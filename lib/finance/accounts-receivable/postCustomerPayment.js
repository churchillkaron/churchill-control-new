import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function postCustomerPayment({

  tenant_id,
  organization_id,
  customer_id,
  customer_invoice_id,

  payment_date,
  amount,

  payment_method,
  reference_number,
  paid_by,

}) {

  const paymentAmount =
    Number(amount || 0);

  if (paymentAmount <= 0) {
    throw new Error(
      "Payment amount required"
    );
  }

  const {
    data: receivable,
    error: receivableError,
  } = await supabaseAdmin

    .from("accounts_receivable")

    .select("*")

    .eq(
      "customer_invoice_id",
      customer_invoice_id
    )

    .single();

  if (receivableError) {
    throw receivableError;
  }

  const newBalance =
    Math.max(
      0,
      Number(
        receivable.outstanding_balance || 0
      ) - paymentAmount
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

      tenant_id,
      organization_id,

      customer_id,
      customer_invoice_id,

      payment_date,

      amount:
        paymentAmount,

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

      outstanding_balance:
        newBalance,

      status:
        newStatus,

    })

    .eq(
      "id",
      receivable.id
    );

  if (arError) {
    throw arError;
  }

  const {
    error: invoiceError,
  } = await supabaseAdmin

    .from("customer_invoices")

    .update({

      outstanding_balance:
        newBalance,

      status:
        newStatus,

    })

    .eq(
      "id",
      customer_invoice_id
    );

  if (invoiceError) {
    throw invoiceError;
  }

  return {

    success: true,

    payment,

    outstanding_balance:
      newBalance,

    status:
      newStatus,

  };

}
