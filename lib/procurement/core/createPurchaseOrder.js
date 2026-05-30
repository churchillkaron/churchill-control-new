import { supabase } from "@/lib/supabase";

export async function createPurchaseOrder({
  tenantId,
  purchaseRequestId,
  vendorId,
  poTotal,
}) {
  const { data, error } =
    await supabase
      .from("purchase_orders")
      .insert({
        tenant_id: tenantId,
        purchase_request_id:
          purchaseRequestId,
        vendor_id: vendorId,
        po_total: poTotal,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
