import { supabase } from "@/lib/supabase";

export async function POST(req) {
  try {
    const body = await req.json();

    const { dish_id, quantity, source_id, tenant_id } = body;

    if (!tenant_id) {
      return Response.json(
        { error: "Missing tenant_id" },
        { status: 400 }
      );
    }
console.log("RUN PRODUCTION", item);
    if (!dish_id || !quantity || quantity <= 0) {
      return Response.json(
        { error: "Missing or invalid dish_id / quantity" },
        { status: 400 }
      );
    }

    // 🔒 IDEMPOTENCY CHECK
    if (source_id) {
      const { data: existing } = await supabase
        .from("production_logs")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("source_id", source_id)
        .limit(1);

      if (existing && existing.length > 0) {
        return Response.json({
          success: true,
          message: "Already processed",
        });
      }
    }

    let totalCost = 0;

    // 🔹 1. GET RECIPE
const { data: recipe, error: recipeError } = await supabase
  .from("recipes")
  .select("id")
  .eq("dish_id", dish_id)
  .eq("tenant_id", tenant_id)
  .single();

if (recipeError || !recipe) {
  return Response.json(
    { error: "No recipe found" },
    { status: 400 }
  );
}

// 🔹 2. GET RECIPE ITEMS
const { data: recipeItems, error: itemsError } = await supabase
  .from("recipe_items")
  .select("*")
  .eq("recipe_id", recipe.id)
  .eq("tenant_id", tenant_id);

if (itemsError) throw itemsError;

if (!recipeItems || recipeItems.length === 0) {
  return Response.json(
    { error: "No recipe items found" },
    { status: 400 }
  );
}

    // 🔴 2. VALIDATE INGREDIENTS
    const ingredientIds = recipeItems.map((r) => r.ingredient_id);

    const { data: ingredients, error: ingredientError } = await supabase
      .from("ingredients")
      .select("id, quantity, cost_per_unit, name")
      .eq("tenant_id", tenant_id)
      .in("id", ingredientIds);

    if (ingredientError) throw ingredientError;

    const ingredientMap = {};
    for (const ing of ingredients || []) {
      ingredientMap[ing.id] = ing;
    }

    for (const recipeItem of recipeItems) {
      const requiredQty =
        Number(recipeItem.quantity || 0) * Number(quantity);

      const ingredient = ingredientMap[recipeItem.ingredient_id];
      const currentStock = Number(ingredient?.quantity || 0);

      if (currentStock < requiredQty) {
        return Response.json(
          {
            error: `Not enough ${ingredient?.name || "ingredient"}`,
          },
          { status: 400 }
        );
      }
    }

    // 🔹 3. PROCESS INGREDIENTS
    for (const recipeItem of recipeItems) {
      const requiredQty =
        Number(recipeItem.quantity || 0) * Number(quantity);

      const ingredient = ingredientMap[recipeItem.ingredient_id];

      const unitCost = Number(ingredient?.cost_per_unit || 0);
      const cost = unitCost * requiredQty;

      totalCost += cost;

      // 🔥 DEDUCT INGREDIENT STOCK
      const { error: stockError } = await supabase.rpc(
        "decrement_ingredient_stock",
        {
          p_tenant_id: tenant_id,
          p_ingredient_id: recipeItem.ingredient_id,
          p_qty: requiredQty,
        }
      );

      if (stockError) {
        throw new Error("Stock deduction failed");
      }

      // 🔥 LOG
      await supabase.from("production_logs").insert({
        tenant_id: tenant_id,
        dish_id,
        ingredient_id: recipeItem.ingredient_id,
        quantity_used: requiredQty,
        source_id: source_id || null,
      });
    }

    // 🔥 FIX: DISH STOCK SHOULD DECREASE (NOT INCREASE)
    const { error: dishStockError } = await supabase.rpc(
      "decrement_dish_stock",
      {
        p_tenant_id: tenant_id,
        p_dish_id: dish_id,
        p_qty: quantity,
      }
    );

    if (dishStockError) {
      throw new Error("Dish stock update failed");
    }

    return Response.json({
      success: true,
      dish_id,
      quantity,
      total_cost: totalCost,
    });

  } catch (err) {
    console.error("PRODUCTION ERROR:", err);

    return Response.json(
      { error: err.message || "Production failed" },
      { status: 500 }
    );
  }
}