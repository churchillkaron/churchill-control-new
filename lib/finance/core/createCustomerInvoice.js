import { supabase } from "@/lib/supabase";

import { postAutomaticJournal } from "@/lib/finance/core/postAutomaticJournal";

export async function createCustomerInvoice({
  tenantId,
  customerName,
  invoiceNumber,
  invoiceDate,
  dueDate,
  invoiceAmount,
}) {
  const invoice =
    await supabase
      .from("ar_customer_invoices")
      .insert({
        tenant_id: tenantId,
        customer_name:
          customerName,
        invoice_number:
          invoiceNumber,
        invoice_date:
          invoiceDate,
        due_date: dueDate,
        invoice_amount:
          invoiceAmount,
        outstanding_balance:
          invoiceAmount,
      })
      .select()
      .single();

  if (invoice.error) {
    throw invoice.error;
  }

  await postAutomaticJournal({
    tenantId,
    journalDate:
      invoiceDate,
    referenceType:
      "AR_INVOICE",
    referenceId:
      invoice.data.id,
    debitAccount:
      "1100_AR",
    creditAccount:
      "4000_REVENUE",
    amount: invoiceAmount,
    description:
      "Customer invoice issued",
  });

  return invoice.data;
}
