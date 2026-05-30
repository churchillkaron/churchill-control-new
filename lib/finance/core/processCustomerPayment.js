import { supabase } from "@/lib/supabase";

import { postAutomaticJournal } from "@/lib/finance/core/postAutomaticJournal";

export async function processCustomerPayment({
  tenantId,
  invoiceId,
  paymentReference,
  paymentAmount,
  paymentMethod,
}) {
  const receipt =
    await supabase
      .from("ar_payment_receipts")
      .insert({
        tenant_id: tenantId,
        invoice_id: invoiceId,
        payment_reference:
          paymentReference,
        payment_amount:
          paymentAmount,
        payment_method:
          paymentMethod,
      })
      .select()
      .single();

  if (receipt.error) {
    throw receipt.error;
  }

  const invoice =
    await supabase
      .from("ar_customer_invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

  const remaining =
    Number(
      invoice.data
        ?.outstanding_balance ||
        0
    ) -
    Number(paymentAmount || 0);

  await supabase
    .from("ar_customer_invoices")
    .update({
      outstanding_balance:
        remaining,
      invoice_status:
        remaining <= 0
          ? "paid"
          : "partial",
    })
    .eq("id", invoiceId);

  await postAutomaticJournal({
    tenantId,
    journalDate:
      new Date()
        .toISOString()
        .split("T")[0],
    referenceType:
      "AR_PAYMENT",
    referenceId:
      invoiceId,
    debitAccount:
      "1000_CASH",
    creditAccount:
      "1100_AR",
    amount: paymentAmount,
    description:
      "Customer payment received",
  });

  return receipt.data;
}
