import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";

const PRODUCTION_SOURCE_DOCUMENTS = ["order_item", "order_items"];
const STALE_CONSUMPTION_DOCUMENT_MS = 30_000;

function isUniqueViolation(error) {
  return String(error?.code || "") === "23505";
}

async function findProductionConsumptionMovement({
  organizationId,
  entityId,
  orderItemId,
  itemId,
}) {
  const { data, error } = await supabaseAdmin
    .from("inventory_movements")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("source_module", "production")
    .eq("source_document_id", orderItemId)
    .eq("item_id", itemId)
    .eq("type", "CONSUMPTION")
    .in("source_document", PRODUCTION_SOURCE_DOCUMENTS)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function removeStaleProductionConsumptionDocument({
  organizationId,
  entityId,
  orderItemId,
  itemId,
}) {
  const { data: document, error: documentError } = await supabaseAdmin
    .from("inventory_documents")
    .select("id, created_at")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("source_module", "production")
    .eq("source_document_id", orderItemId)
    .eq("item_id", itemId)
    .eq("movement_type", "CONSUMPTION")
    .in("source_document", PRODUCTION_SOURCE_DOCUMENTS)
    .limit(1)
    .maybeSingle();

  if (documentError) throw documentError;
  if (!document) return false;

  const createdAt = Date.parse(document.created_at || "");
  if (
    !Number.isFinite(createdAt) ||
    Date.now() - createdAt < STALE_CONSUMPTION_DOCUMENT_MS
  ) {
    return false;
  }

  const { data: movement, error: movementError } = await supabaseAdmin
    .from("inventory_movements")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("document_id", document.id)
    .limit(1)
    .maybeSingle();

  if (movementError) throw movementError;
  if (movement) return false;

  const { error: deleteError } = await supabaseAdmin
    .from("inventory_documents")
    .delete()
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", document.id);

  if (deleteError) throw deleteError;
  return true;
}

async function createProductionConsumptionMovement({
  organizationId,
  entityId,
  orderItemId,
  itemId,
  quantity,
  unitCost,
  dishId,
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await createInventoryMovement({
        organizationId,
        entityId,
        itemId,
        movementType: "CONSUMPTION",
        quantity,
        unitCost,
        referenceType: "ORDER_ITEM",
        referenceId: orderItemId,
        sourceModule: "production",
        sourceDocument: "order_items",
        sourceDocumentId: orderItemId,
        notes: `Production consumption for dish ${dishId}`,
        postToFinance: true,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      const existingMovement = await findProductionConsumptionMovement({
        organizationId,
        entityId,
        orderItemId,
        itemId,
      });

      if (existingMovement) {
        return {
          success: true,
          reused: true,
          movement: existingMovement,
        };
      }

      if (
        attempt === 0 &&
        await removeStaleProductionConsumptionDocument({
          organizationId,
          entityId,
          orderItemId,
          itemId,
        })
      ) {
        continue;
      }

      const conflict = new Error(
        "Production consumption is already being created; retry",
      );
      conflict.code = "PRODUCTION_CONSUMPTION_IN_PROGRESS";
      conflict.status = 409;
      throw conflict;
    }
  }

  throw new Error("Production consumption could not be created");
}

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
        .eq("source_module", "production")
        .eq("source_document_id", order_item_id)
        .eq("type", "CONSUMPTION")
        .in("source_document", PRODUCTION_SOURCE_DOCUMENTS);

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

      const movement = await createProductionConsumptionMovement({
        organizationId: resolvedOrganizationId,
        entityId: resolvedEntityId,
        orderItemId: order_item_id,
        itemId: recipe.item_id,
        quantity: required,
        unitCost: Number(inventoryItem.cost || 0),
        dishId: orderItem.dish_id,
      });

      movements.push(movement);

      const movementRow = movement?.movement || null;
      if (movementRow?.item_id) {
        existingByItemId.set(movementRow.item_id, movementRow);
      }
    }

    return {
      success: true,
      movements,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code || null,
      status: error.status || null,
    };
  }
}
