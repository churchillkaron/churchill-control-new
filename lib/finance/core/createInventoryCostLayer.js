import { supabase } from "@/lib/supabase";

export async function createInventoryCostLayer({
  tenantId,
  itemId,
  sourceEventId,
  quantity,
  unitCost,
}) {
  const totalCost =
    Number(quantity || 0) *
    Number(unitCost || 0);

  const { data, error } =
    await supabase
      .from("inventory_cost_layers")
      .insert({
        tenant_id: tenantId,
        item_id: itemId,
        layer_type: "FIFO",
        source_event_id:
          sourceEventId,
        quantity_remaining:
          quantity,
        unit_cost: unitCost,
        total_cost: totalCost,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
