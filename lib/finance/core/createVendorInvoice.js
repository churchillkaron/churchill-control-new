import { supabase } from "@/lib/supabase";

export async function createVendorInvoice({
  tenantId,
  vendorName,
  invoiceNumber,
  invoiceDate,
  dueDate,
  invoiceAmount,
}) {
  const { data, error } =
    await supabase
      .from("ap_vendor_invoices")
      .insert({
        tenant_id: tenantId,
        vendor_name:
          vendorName,
        invoice_number:
          invoiceNumber,
        invoice_date:
          invoiceDate,
        due_date: dueDate,
        invoice_amount:
          invoiceAmount,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
