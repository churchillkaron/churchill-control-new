import { supabase } from "@/lib/supabase";

export async function createInventoryMovement({
  tenantId,
  ingredientId,
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
        ingredient_id: ingredientId,
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
