import { supabase } from "@/lib/supabase";

export async function runProduction({
  tenant_id,
  dish_id,
  quantity,
  source_id,
}) {
  // 🔒 HARD LOCK (idempotent)
  const { data: existing } = await supabase
    .from("production_logs")
    .select("id")
    .eq("source_id", source_id)
    .maybeSingle();

  if (existing) {
    console.log("SKIP (already processed):", source_id);
    return true;
  }

  // 🔹 GET RECIPE
  const { data: recipeItems, error } = await supabase
    .from("recipe_items")
    .select("*")
    .eq("dish_id", dish_id)
    .eq("tenant_id", tenant_id);

  if (error) throw error;
  if (!recipeItems || recipeItems.length === 0) {
    throw new Error("No recipe found");
  }

  // 🔴 LOAD INGREDIENTS IN ONE QUERY (FAST)
  const ingredientIds = recipeItems.map(r => r.ingredient_id);

  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, quantity, name")
    .in("id", ingredientIds)
    .eq("tenant_id", tenant_id);

  const map = {};
  for (const i of ingredients || []) map[i.id] = i;

  // 🔴 VALIDATE STOCK FIRST
  for (const r of recipeItems) {
    const needed = Number(r.quantity) * Number(quantity);
    const stock = Number(map[r.ingredient_id]?.quantity || 0);

    if (stock < needed) {
      throw new Error(`Not enough ${map[r.ingredient_id]?.name}`);
    }
  }

  // 🔹 PROCESS (ATOMIC LOOP)
  for (const r of recipeItems) {
    const needed = Number(r.quantity) * Number(quantity);

    const { error: stockError } = await supabase.rpc(
      "decrement_ingredient_stock",
      {
        p_tenant_id: tenant_id,
        p_ingredient_id: r.ingredient_id,
        p_qty: needed,
      }
    );

    if (stockError) throw new Error("Stock deduction failed");

    // 🔒 LOG LOCK PER ITEM
    await supabase.from("production_logs").insert({
      tenant_id,
      dish_id,
      ingredient_id: r.ingredient_id,
      quantity_used: needed,
      source_id,
    });
  }

  // 🔹 UPDATE DISH STOCK
  const { error: dishError } = await supabase.rpc(
    "increment_dish_stock",
    {
      p_tenant_id: tenant_id,
      p_dish_id: dish_id,
      p_qty: quantity,
    }
  );

  if (dishError) throw new Error("Dish stock update failed");

  return true;
}