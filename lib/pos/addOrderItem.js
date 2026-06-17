import { supabase } from "@/lib/shared/supabase/client";
import { updateOrderItemQuantity } from "./updateOrderItemQuantity";

/**
 * SAFE POS BRIDGE
 * Adds item into existing order_items system
 * Does NOT replace existing POS logic
 */
export async function addOrderItem({
  tenantId,
  orderId,
  dish,
  quantity = 1,
  price = 0,
  cost = 0,
  notes = "",
  modifiers = [],
  createdBy = "WAITER",
}) {
  if (!tenantId) throw new Error("tenantId required");
  if (!orderId) throw new Error("orderId required");
  if (!dish?.id) throw new Error("dish required");

  // 1. CREATE ORDER ITEM
  const { data, error } = await supabase
    .from("order_items")
    .insert({
      tenant_id: tenantId,
      order_id: orderId,
      dish_id: dish.id,
      item_name: dish.name,
      quantity,
      price,
      cost,
      notes,
      status: "PENDING",
      created_by: createdBy,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  // 2. ADD MODIFIERS (if any)
  if (modifiers.length > 0) {
    const modifierRows = modifiers.map((m) => ({
      tenant_id: tenantId,
      order_item_id: data.id,
      name: m.name,
      price: m.price || 0,
      total: m.total || 0,
    }));

    await supabase.from("order_item_modifiers").insert(modifierRows);
  }

  // 3. FORCE ORDER RECALC (reuse existing engine)
  await updateOrderItemQuantity({
    tenantId,
    orderItemId: data.id,
    quantity,
  });

  return data;
}
