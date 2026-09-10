import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listProductionRecipes({ organizationId, entityId = null }) {
  if (!organizationId) throw new Error("Organization ID is required");

  let dishesQuery = supabaseAdmin.from("dishes")
    .select("id, name, dish_code, price, cost, category, costing_method, production_type, recipe_output_quantity, recipe_output_uom_id, organization_id, entity_id")
    .eq("organization_id", organizationId).order("name");
  let recipeQuery = supabaseAdmin.from("recipe_items")
    .select("id, dish_id, item_id, component_dish_id, quantity, unit, uom_id, yield_percent, organization_id, entity_id")
    .eq("organization_id", organizationId);
  let inventoryQuery = supabaseAdmin.from("inventory_items")
    .select("id, name, code, type, cost, uom_id, entity_id, is_active, organization_id")
    .eq("organization_id", organizationId).order("name");
  if (entityId) {
    dishesQuery = dishesQuery.eq("entity_id", entityId);
    recipeQuery = recipeQuery.eq("entity_id", entityId);
    inventoryQuery = inventoryQuery.eq("entity_id", entityId);
  }

  const [dishesResult, recipeItemsResult, inventoryItemsResult] = await Promise.all([dishesQuery, recipeQuery, inventoryQuery]);
  if (dishesResult.error) throw dishesResult.error;
  if (recipeItemsResult.error) throw recipeItemsResult.error;
  if (inventoryItemsResult.error) throw inventoryItemsResult.error;

  const dishesRaw = dishesResult.data || [];
  const inventoryItems = inventoryItemsResult.data || [];
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
  const dishById = new Map(dishesRaw.map((dish) => [dish.id, dish]));
  const recipeItemsByDish = new Map();

  for (const recipeItem of recipeItemsResult.data || []) {
    const item = recipeItem.item_id ? inventoryById.get(recipeItem.item_id) || null : null;
    const componentDish = recipeItem.component_dish_id ? dishById.get(recipeItem.component_dish_id) || null : null;
    const dishItems = recipeItemsByDish.get(recipeItem.dish_id) || [];
    dishItems.push({ ...recipeItem, component_type: componentDish ? "COMPONENT_RECIPE" : "INVENTORY_ITEM", item, component_dish: componentDish });
    recipeItemsByDish.set(recipeItem.dish_id, dishItems);
  }

  const dishes = dishesRaw.map((dish) => ({ ...dish, recipe_items: recipeItemsByDish.get(dish.id) || [] }));
  return { dishes, inventoryItems };
}
