import { supabase } from "@/lib/supabase";

export async function approveVendorInvoice({
  tenantId,
  invoiceId,
  approvedBy,
  approvalRole,
}) {
  const approval =
    await supabase
      .from(
        "ap_invoice_approvals"
      )
      .insert({
        tenant_id: tenantId,
        invoice_id: invoiceId,
        approved_by:
          approvedBy,
        approval_role:
          approvalRole,
      })
      .select()
      .single();

  await supabase
    .from("ap_vendor_invoices")
    .update({
      invoice_status:
        "approved",
    })
    .eq("id", invoiceId);

  return approval.data;
}
