import { createClient } from "@supabase/supabase-js";

export async function runProduction({
  tenant_id,
  dish_id,
  quantity,
  source_id,
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase environment variables");
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  if (!tenant_id || !dish_id || !quantity) {
    throw new Error("Missing production data");
  }

  // 🔹 IDEMPOTENCY
  if (source_id) {
    const { data: existing } = await supabase
      .from("production_logs")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("source_id", source_id)
      .limit(1);

    if (existing && existing.length > 0) {
      return { success: true, message: "Already processed" };
    }
  }

  let totalCost = 0;

  // 🔹 GET RECIPE
  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .select("id")
    .eq("dish_id", dish_id)
    .eq("tenant_id", tenant_id)
    .single();

  if (recipeError || !recipe) {
    throw new Error("No recipe found");
  }

  // 🔹 GET ITEMS
  const { data: recipeItems, error: itemsError } = await supabase
    .from("recipe_items")
    .select("*")
    .eq("recipe_id", recipe.id)
    .eq("tenant_id", tenant_id);

  if (itemsError) throw itemsError;

  if (!recipeItems || recipeItems.length === 0) {
    throw new Error("No recipe items found");
  }

  // 🔹 INGREDIENTS
  const ingredientIds = recipeItems.map((r) => r.ingredient_id);

  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, quantity, cost_per_unit, name")
    .eq("tenant_id", tenant_id)
    .in("id", ingredientIds);

  const ingredientMap = {};
  for (const ing of ingredients || []) {
    ingredientMap[ing.id] = ing;
  }

  // 🔴 VALIDATE
  for (const item of recipeItems) {
    const requiredQty = Number(item.quantity) * Number(quantity);
    const stock = Number(ingredientMap[item.ingredient_id]?.quantity || 0);

    if (stock < requiredQty) {
      throw new Error(`Not enough ${ingredientMap[item.ingredient_id]?.name}`);
    }
  }

  // 🔹 PROCESS
  for (const item of recipeItems) {
    const requiredQty = Number(item.quantity) * Number(quantity);
    const ingredient = ingredientMap[item.ingredient_id];

    const cost =
      Number(ingredient?.cost_per_unit || 0) * requiredQty;

    totalCost += cost;

    await supabase.rpc("decrement_ingredient_stock", {
      p_tenant_id: tenant_id,
      p_ingredient_id: item.ingredient_id,
      p_qty: requiredQty,
    });

    await supabase.from("production_logs").insert({
      tenant_id,
      dish_id,
      ingredient_id: item.ingredient_id,
      quantity_used: requiredQty,
      source_id: source_id || null,
    });
  }

  // 🔹 DISH STOCK
  await supabase.rpc("decrement_dish_stock", {
  p_tenant_id: tenant_id,
  p_dish_id: item.dish_id, // must already be UUID
  p_qty: Number(requiredQty), // 🔥 force numeric
});

  return {
    success: true,
    dish_id,
    quantity,
    total_cost: totalCost,
  };
}