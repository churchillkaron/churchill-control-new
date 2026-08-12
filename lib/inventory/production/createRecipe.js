import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeRecipeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Recipe items are required");
  }

  const normalized = items.map((item) => {
    const itemId = item?.item_id;
    const quantity = Number(item?.quantity);

    if (!itemId) {
      throw new Error("Each recipe item requires item_id");
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Recipe item quantity must be greater than zero");
    }

    return {
      item_id: itemId,
      quantity,
      unit: item?.unit || null,
    };
  });

  const uniqueItemIds = new Set(normalized.map((item) => item.item_id));

  if (uniqueItemIds.size !== normalized.length) {
    throw new Error("Recipe items must not contain duplicate inventory items");
  }

  return normalized;
}

export async function createRecipe({
  dish_id,
  items,
  organization_id,
  organizationId,
}) {
  const resolvedOrganizationId = organizationId || organization_id;

  if (!dish_id) {
    throw new Error("Dish ID is required");
  }

  if (!resolvedOrganizationId) {
    throw new Error("Organization ID is required");
  }

  const normalizedItems = normalizeRecipeItems(items);

  const { data: dish, error: dishError } = await supabaseAdmin
    .from("dishes")
    .select("id, organization_id")
    .eq("id", dish_id)
    .eq("organization_id", resolvedOrganizationId)
    .single();

  if (dishError || !dish) {
    throw new Error("Dish not found for this organization");
  }

  const itemIds = normalizedItems.map((item) => item.item_id);
  const { data: inventoryItems, error: inventoryItemsError } = await supabaseAdmin
    .from("inventory_items")
    .select("id, cost, organization_id")
    .eq("organization_id", resolvedOrganizationId)
    .in("id", itemIds);

  if (inventoryItemsError) {
    throw new Error(inventoryItemsError.message);
  }

  if (!inventoryItems || inventoryItems.length !== itemIds.length) {
    throw new Error("Some inventory items were not found for this organization");
  }

  const inventoryById = new Map(
    inventoryItems.map((item) => [item.id, item]),
  );

  const totalCost = normalizedItems.reduce((sum, item) => {
    const inventoryItem = inventoryById.get(item.item_id);
    return sum + Number(inventoryItem?.cost || 0) * item.quantity;
  }, 0);

  const { error: deleteError } = await supabaseAdmin
    .from("recipe_items")
    .delete()
    .eq("dish_id", dish_id)
    .eq("organization_id", resolvedOrganizationId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const recipeRows = normalizedItems.map((item) => ({
    dish_id,
    item_id: item.item_id,
    quantity: item.quantity,
    unit: item.unit,
    organization_id: resolvedOrganizationId,
  }));

  const { error: insertError } = await supabaseAdmin
    .from("recipe_items")
    .insert(recipeRows);

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { error: updateDishError } = await supabaseAdmin
    .from("dishes")
    .update({
      cost: Number(totalCost.toFixed(4)),
    })
    .eq("id", dish_id)
    .eq("organization_id", resolvedOrganizationId);

  if (updateDishError) {
    throw new Error(updateDishError.message);
  }

  return {
    success: true,
    dish_id,
    total_cost: Number(totalCost.toFixed(4)),
    item_count: recipeRows.length,
  };
}
