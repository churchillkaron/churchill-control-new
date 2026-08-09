import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";

export default async function processInventoryConsumption({
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
  order_item_id,
  dish_id,
  quantity = 1,
}) {
  try {
    const resolvedOrganizationId =
      organization_id || organizationId;

    const resolvedEntityId =
      entity_id || entityId || null;

    if (!resolvedOrganizationId) {
      throw new Error("organization_id required");
    }

    if (!dish_id) {
      throw new Error("dish_id required");
    }

    if (resolvedEntityId) {
      const { data: entity, error: entityError } =
        await supabaseAdmin
          .from("legal_entities")
          .select("id")
          .eq("organization_id", resolvedOrganizationId)
          .eq("id", resolvedEntityId)
          .maybeSingle();

      if (entityError) {
        throw entityError;
      }

      if (!entity) {
        throw new Error("entity_id does not belong to organization");
      }
    }

    const { data: recipeItems, error: recipeError } =
      await supabaseAdmin
        .from("recipe_items")
        .select(`
          id,
          item_id,
          quantity,
          ingredients (
            id,
            name,
            quantity,
            unit,
            cost,
            cost_per_base_unit
          )
        `)
        .eq("organization_id", resolvedOrganizationId)
        .eq("dish_id", dish_id);

    if (recipeError) {
      throw recipeError;
    }

    const movements = [];

    for (const recipe of recipeItems || []) {
      const ingredient =
        recipe.ingredients;

      if (!ingredient?.id) {
        continue;
      }

      const required =
        Number(recipe.quantity || 0) *
        Number(quantity || 0);

      if (required <= 0) {
        continue;
      }

      const unitCost =
        Number(
          ingredient.cost_per_base_unit ||
          ingredient.cost ||
          0
        );

      const movement =
        await createInventoryMovement({
          organizationId: resolvedOrganizationId,
          entityId: resolvedEntityId,
          itemId: ingredient.id,
          movementType: "CONSUMPTION",
          quantity: required,
          unitCost,
          referenceType: "ORDER_ITEM",
          referenceId: order_item_id,
          sourceModule: "production",
          sourceDocument: "order_item",
          sourceDocumentId: order_item_id,
          notes: `Production consumption for dish ${dish_id}`,
          postToFinance: Boolean(resolvedEntityId),
        });

      movements.push(movement);
    }

    return {
      success: true,
      movements,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
