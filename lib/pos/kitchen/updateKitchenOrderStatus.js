import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function updateKitchenOrderStatus(body) {
  const { itemId, status, tenantId } = body;

  if (!itemId || !status || !tenantId) {
    return { success: false, error: "Missing fields" };
  }

  const { data, error } = await supabaseAdmin
    .from("order_items")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    item: data,
  };
}
