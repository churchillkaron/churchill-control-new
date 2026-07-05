import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";
import { recordSystemEvent } from "@/lib/events/recordSystemEvent";

export async function logWaste({
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
  ingredient_id,
  quantity,
  reason,
  created_by = "SYSTEM",
  department = "production",
}) {
  const resolvedOrganizationId =
    organization_id || organizationId;

  const resolvedEntityId =
    entity_id || entityId || null;

  if (!resolvedOrganizationId) {
    throw new Error("organization_id required");
  }

  const wasteQty =
    Number(quantity || 0);

  if (wasteQty <= 0) {
    throw new Error("Invalid quantity");
  }

  const {
    data: ingredient,
    error: ingredientError,
  } = await supabaseAdmin
    .from("ingredients")
    .select("*")
    .eq("id", ingredient_id)
    .single();

  if (ingredientError) {
    throw ingredientError;
  }

  const estimatedCost =
    Number(
      (
        wasteQty *
        Number(
          ingredient.cost_per_base_unit ||
          ingredient.cost ||
          0
        )
      ).toFixed(4)
    );

  const {
    data: wasteLog,
    error: wasteError,
  } = await supabaseAdmin
    .from("production_waste_logs")
    .insert({
      organization_id: resolvedOrganizationId,
      entity_id: resolvedEntityId,
      ingredient_id,
      quantity: wasteQty,
      estimated_cost: estimatedCost,
      reason,
      created_by,
    })
    .select()
    .single();

  if (wasteError) {
    throw wasteError;
  }

  const movement =
    await createInventoryMovement({
      organizationId: resolvedOrganizationId,
      entityId: resolvedEntityId,
      ingredientId: ingredient_id,
      movementType: "WASTE",
      quantity: wasteQty,
      unitCost:
        ingredient.cost_per_base_unit ||
        ingredient.cost ||
        0,
      referenceType: "PRODUCTION_WASTE",
      referenceId: wasteLog.id,
      sourceModule: "production",
      sourceDocument: "production_waste_logs",
      sourceDocumentId: wasteLog.id,
      notes: reason,
      createdBy: created_by,
      postToFinance: Boolean(resolvedEntityId),
    });

  await recordSystemEvent({
    organizationId: resolvedOrganizationId,
    type: "INVENTORY_WASTE",
    payload: {
      waste_id: wasteLog.id,
      movement_id: movement.movement.id,
      ingredient_id,
      quantity: wasteQty,
      estimated_cost: estimatedCost,
      department,
      reason,
    },
  });

  return {
    success: true,
    wasteLog,
    movement,
  };
}
