import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createVendorInvoice({
  organizationId,
  entityId,
  invoiceNumber,
  vendorId,
  invoiceDate,
  dueDate,
  currencyCode = "THB",
  exchangeRate = 1,
  subtotal = 0,
  taxAmount = 0,
  discountAmount = 0,
  totalAmount = 0,
  createdBy,
}) {
  const { data, error } =
    await supabaseAdmin
      .from("vendor_invoices")
      .insert({
        organization_id: organizationId,
        entity_id: entityId,
        invoice_number: invoiceNumber,
        vendor_id: vendorId,
        invoice_date: invoiceDate,
        due_date: dueDate,
        currency_code: currencyCode,
        exchange_rate: exchangeRate,
        subtotal: Number(subtotal),
        tax_amount: Number(taxAmount),
        discount_amount: Number(discountAmount),
        total_amount: Number(totalAmount),
        outstanding_amount: Number(totalAmount),
        status: "DRAFT",
        created_by: createdBy,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
