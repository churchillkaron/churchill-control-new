import { supabase } from "@/lib/supabase";

export async function createInventoryMovement({
  tenantId,
  itemId,
  movementType,
  quantity,
  unitCost,
  referenceType,
  referenceId,
}) {
  const totalCost =
    Number(quantity || 0) *
    Number(unitCost || 0);

  const { data, error } =
    await supabase
      .from("inventory_movements")
      .insert({
        tenant_id: tenantId,
        item_id: itemId,
        movement_type:
          movementType,
        quantity,
        unit_cost: unitCost,
        total_cost: totalCost,
        reference_type:
          referenceType,
        reference_id:
          referenceId,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
