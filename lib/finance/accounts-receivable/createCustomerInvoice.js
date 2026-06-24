import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function createCustomerInvoice({

  tenant_id,
  organization_id,
  customer_id,

  invoice_number,
  invoice_date,
  due_date,

  subtotal = 0,
  tax_amount = 0,
  notes = null,

}) {

  if (!tenant_id) {
    throw new Error("tenant_id required");
  }

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!customer_id) {
    throw new Error("customer_id required");
  }

  const total_amount =
    Number(subtotal || 0) +
    Number(tax_amount || 0);

  const {
    data: invoice,
    error: invoiceError,
  } = await supabaseAdmin
    .from("customer_invoices")
    .insert({
      tenant_id,
      organization_id,
      customer_id,
      invoice_number,
      invoice_date,
      due_date,
      subtotal,
      tax_amount,
      total_amount,
      outstanding_balance:
        total_amount,
      status: "OPEN",
      notes,
    })
    .select()
    .single();

  if (invoiceError) {
    throw invoiceError;
  }

  const {
    data: receivable,
    error: receivableError,
  } = await supabaseAdmin
    .from("accounts_receivable")
    .insert({
      tenant_id,
      organization_id,
      customer_id,
      customer_invoice_id:
        invoice.id,
      amount:
        total_amount,
      outstanding_balance:
        total_amount,
      due_date,
      status:
        "OPEN",
    })
    .select()
    .single();

  if (receivableError) {
    throw receivableError;
  }

  return {
    success: true,
    invoice,
    receivable,
  };

}
