import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function getKitchenOrders({ tenant_id }) {
  if (!tenant_id) {
    return { success: false, error: "Missing tenant_id" };
  }

  const { data, error } = await supabaseAdmin
    .from("order_items")
    .select("*")
    .eq("tenant_id", tenant_id)
    .in("status", ["PENDING", "PREPARING", "READY"]);

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: data || [],
  };
}
