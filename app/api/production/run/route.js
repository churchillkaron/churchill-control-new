import { supabase } from "@/lib/supabase";

export async function POST(req) {
  const { dish_id, quantity } = await req.json();

  const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  if (!dish_id || !quantity || quantity <= 0) {
    return Response.json(
      { error: "Missing or invalid dish_id / quantity" },
      { status: 400 }
    );
  }

  try {
    let totalCost = 0;

    // 🔹 1. GET RECIPE
    const { data: recipeItems, error: recipeError } = await supabase
      .from("recipe_items")
      .select("*")
      .eq("dish_id", dish_id)
      .eq("tenant_id", tenant_id);

    if (recipeError) throw recipeError;

    if (!recipeItems || recipeItems.length === 0) {
      return Response.json(
        { error: "No recipe found" },
        { status: 400 }
      );
    }

    // 🔴 2. CHECK INGREDIENT AVAILABILITY FIRST
    for (const recipeItem of recipeItems) {
      const requiredQty =
        Number(recipeItem.quantity || 0) * Number(quantity);

      const { data: ingredient } = await supabase
        .from("ingredients")
        .select("quantity, cost_per_unit, name")
        .eq("id", recipeItem.ingredient_id)
        .eq("tenant_id", tenant_id)
        .single();

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

      const { data: ingredient } = await supabase
        .from("ingredients")
        .select("cost_per_unit")
        .eq("id", recipeItem.ingredient_id)
        .eq("tenant_id", tenant_id)
        .single();

      const unitCost = Number(ingredient?.cost_per_unit || 0);
      const cost = unitCost * requiredQty;

      totalCost += cost;

      // 🔥 deduct ingredient stock
      await supabase.rpc("decrement_ingredient_stock", {
        p_tenant_id: tenant_id,
        p_ingredient_id: recipeItem.ingredient_id,
        p_qty: requiredQty,
      });

      // 🔥 log production usage
      await supabase.from("production_logs").insert({
        tenant_id,
        dish_id,
        ingredient_id: recipeItem.ingredient_id,
        quantity_used: requiredQty,
      });
    }

    // 🔹 4. INCREASE DISH STOCK
    await supabase.rpc("increment_dish_stock", {
      p_tenant_id: tenant_id,
      p_dish_id: dish_id,
      p_qty: quantity,
    });

    return Response.json({
      success: true,
      dish_id,
      quantity,
      total_cost: totalCost,
    });

  } catch (err) {
    console.error("PRODUCTION ERROR:", err);

    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}