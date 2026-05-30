import { supabase } from "@/lib/supabase";

import { postAutomaticJournal } from "@/lib/finance/core/postAutomaticJournal";

export async function processVendorPayment({
  tenantId,
  invoiceId,
  paymentReference,
  paymentAmount,
  paymentMethod,
}) {
  const payment =
    await supabase
      .from(
        "ap_payment_transactions"
      )
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

  await supabase
    .from("ap_vendor_invoices")
    .update({
      invoice_status: "paid",
    })
    .eq("id", invoiceId);

  await postAutomaticJournal({
    tenantId,
    journalDate:
      new Date()
        .toISOString()
        .split("T")[0],
    referenceType:
      "AP_PAYMENT",
    referenceId:
      invoiceId,
    debitAccount:
      "2000_AP",
    creditAccount:
      "1000_CASH",
    amount: paymentAmount,
    description:
      "Vendor payment processed",
  });

  return payment.data;
}
