import { supabase } from "@/lib/supabase";

export async function createPurchaseRequest({
  tenantId,
  requestedBy,
  department,
  requestTotal,
}) {
  const { data, error } =
    await supabase
      .from("purchase_requests")
      .insert({
        tenant_id: tenantId,
        requested_by:
          requestedBy,
        department,
        request_total:
          requestTotal,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
