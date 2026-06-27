import { supabase } from "@/lib/shared/supabase/client";

/**
 * SINGLE SOURCE OF TRUTH FOR POS ORDERS
 * Used by all POS screens
 */

export async function loadPOSState(organizationId) {

  if (!organizationId) return { orders: [], items: {} };

  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      *,
      order_items (*)
    `)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("POS LOAD ERROR:", error);
    return { orders: [], items: {} };
  }

  const itemMap = {};

  for (const order of orders || []) {
    itemMap[order.id] = order.order_items || [];
  }

  return {
    orders: orders || [],
    items: itemMap
  };
}
