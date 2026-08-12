import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listProductionRecipes({ organizationId }) {
  if (!organizationId) {
    throw new Error("Organization ID is required");
  }

  const [dishesResult, recipeItemsResult, inventoryItemsResult] =
    await Promise.all([
      supabaseAdmin
        .from("dishes")
        .select(
          "id, name, price, cost, category, costing_method, production_type, organization_id",
        )
        .eq("organization_id", organizationId)
        .order("name"),
      supabaseAdmin
        .from("recipe_items")
        .select("id, dish_id, item_id, quantity, unit, organization_id")
        .eq("organization_id", organizationId),
      supabaseAdmin
        .from("inventory_items")
        .select(
          "id, name, code, type, cost, uom_id, entity_id, is_active, organization_id",
        )
        .eq("organization_id", organizationId)
        .order("name"),
    ]);

  if (dishesResult.error) {
    throw dishesResult.error;
  }

  if (recipeItemsResult.error) {
    throw recipeItemsResult.error;
  }

  if (inventoryItemsResult.error) {
    throw inventoryItemsResult.error;
  }

  const inventoryItems = inventoryItemsResult.data || [];
  const inventoryById = new Map(
    inventoryItems.map((item) => [item.id, item]),
  );
  const recipeItemsByDish = new Map();

  for (const recipeItem of recipeItemsResult.data || []) {
    const item = inventoryById.get(recipeItem.item_id) || null;
    const dishItems = recipeItemsByDish.get(recipeItem.dish_id) || [];

    dishItems.push({
      ...recipeItem,
      item,
    });

    recipeItemsByDish.set(recipeItem.dish_id, dishItems);
  }

  const dishes = (dishesResult.data || []).map((dish) => ({
    ...dish,
    recipe_items: recipeItemsByDish.get(dish.id) || [],
  }));

  return {
    dishes,
    inventoryItems,
  };
}
