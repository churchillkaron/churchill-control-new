import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";
import { postAutomaticJournal } from "@/lib/finance/core/postAutomaticJournal";

export async function processCustomerPayment({
  tenantId,
  invoiceId,
  paymentReference,
  paymentAmount,
  paymentMethod,
}) {
  const receipt = await supabase
    .from("ar_payment_receipts")
    .insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      payment_reference: paymentReference,
      payment_amount: paymentAmount,
      payment_method: paymentMethod,
    })
    .select()
    .single();

  if (receipt.error) {
    throw receipt.error;
  }

  const invoice = await supabase
    .from("ar_customer_invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (invoice.error) {
    throw invoice.error;
  }

  const remaining =
    Number(invoice.data?.outstanding_balance || 0) -
    Number(paymentAmount || 0);

  await supabase
    .from("ar_customer_invoices")
    .update({
      outstanding_balance: remaining,
      invoice_status:
        remaining <= 0 ? "paid" : "partial",
    })
    .eq("id", invoiceId);

  const debitAccount =
    String(paymentMethod || "").toLowerCase() === "cash"
      ? "1000"
      : "1100";

  await postAutomaticJournal({
    tenantId,
    journalDate: new Date().toISOString().split("T")[0],
    referenceType: "AR_PAYMENT",
    referenceId: invoiceId,
    debitAccount,
    creditAccount: "1200",
    amount: paymentAmount,
    description: "Customer payment received",
    createdBy: "system",
  });

  return receipt.data;
}
