import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";

export default async function processInventoryConsumption({
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
  order_item_id,
}) {
  try {
    const resolvedOrganizationId =
      organizationId || organization_id;

    const resolvedEntityId =
      entityId || entity_id || null;

    if (!resolvedOrganizationId) {
      throw new Error("organization_id required");
    }

    if (!resolvedEntityId) {
      throw new Error("entity_id required");
    }

    if (!order_item_id) {
      throw new Error("order_item_id required");
    }

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

    const { data: orderItem, error: orderItemError } =
      await supabaseAdmin
        .from("order_items")
        .select("id, dish_id, quantity")
        .eq("organization_id", resolvedOrganizationId)
        .eq("id", order_item_id)
        .maybeSingle();

    if (orderItemError) {
      throw orderItemError;
    }

    if (!orderItem) {
      throw new Error("order_item_id does not belong to organization");
    }

    if (!orderItem.dish_id) {
      throw new Error("order item has no dish_id");
    }

    const orderQuantity = Number(orderItem.quantity || 0);

    if (orderQuantity <= 0) {
      throw new Error("order item quantity must be greater than zero");
    }

    const { data: dish, error: dishError } =
      await supabaseAdmin
        .from("dishes")
        .select("id")
        .eq("organization_id", resolvedOrganizationId)
        .eq("id", orderItem.dish_id)
        .maybeSingle();

    if (dishError) {
      throw dishError;
    }

    if (!dish) {
      throw new Error("dish_id does not belong to organization");
    }

    const { data: recipeItems, error: recipeError } =
      await supabaseAdmin
        .from("recipe_items")
        .select("id, item_id, quantity")
        .eq("organization_id", resolvedOrganizationId)
        .eq("dish_id", orderItem.dish_id);

    if (recipeError) {
      throw recipeError;
    }

    const recipes = (recipeItems || []).filter(
      (recipe) => recipe.item_id,
    );

    if (recipes.length === 0) {
      return {
        success: true,
        movements: [],
      };
    }

    const itemIds = [
      ...new Set(
        recipes.map((recipe) => recipe.item_id),
      ),
    ];

    const { data: inventoryItems, error: inventoryItemError } =
      await supabaseAdmin
        .from("inventory_items")
        .select("id, organization_id, entity_id, cost")
        .eq("organization_id", resolvedOrganizationId)
        .in("id", itemIds);

    if (inventoryItemError) {
      throw inventoryItemError;
    }

    const inventoryItemsById = new Map(
      (inventoryItems || []).map((item) => [item.id, item]),
    );

    const { data: existingMovements, error: existingMovementError } =
      await supabaseAdmin
        .from("inventory_movements")
        .select("*")
        .eq("organization_id", resolvedOrganizationId)
        .eq("entity_id", resolvedEntityId)
        .eq("source_document_id", order_item_id)
        .eq("type", "CONSUMPTION")
        .in("source_document", ["order_item", "order_items"]);

    if (existingMovementError) {
      throw existingMovementError;
    }

    const existingByItemId = new Map(
      (existingMovements || []).map((movement) => [
        movement.item_id,
        movement,
      ]),
    );

    const movements = [];

    for (const recipe of recipes) {
      const inventoryItem = inventoryItemsById.get(recipe.item_id);

      if (!inventoryItem) {
        throw new Error("recipe item does not belong to organization");
      }

      if (
        inventoryItem.entity_id &&
        inventoryItem.entity_id !== resolvedEntityId
      ) {
        throw new Error("recipe item does not belong to entity");
      }

      const existingMovement = existingByItemId.get(recipe.item_id);

      if (existingMovement) {
        movements.push({
          success: true,
          reused: true,
          movement: existingMovement,
        });
        continue;
      }

      const required =
        Number(recipe.quantity || 0) *
        orderQuantity;

      if (required <= 0) {
        continue;
      }

      const movement = await createInventoryMovement({
        organizationId: resolvedOrganizationId,
        entityId: resolvedEntityId,
        itemId: recipe.item_id,
        movementType: "CONSUMPTION",
        quantity: required,
        unitCost: Number(inventoryItem.cost || 0),
        referenceType: "ORDER_ITEM",
        referenceId: order_item_id,
        sourceModule: "production",
        sourceDocument: "order_items",
        sourceDocumentId: order_item_id,
        notes: `Production consumption for dish ${orderItem.dish_id}`,
        postToFinance: true,
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
