import { supabase } from "@/lib/supabase";

const TENANT_ID = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export async function POST(req) {
  try {
    const body = await req.json();

    const { dish_id, quantity, source_id } = body;
    // source_id = order_id or manual trigger id (PREVENT DUPLICATES)

    if (!dish_id || !quantity || quantity <= 0) {
      return Response.json(
        { error: "Missing or invalid dish_id / quantity" },
        { status: 400 }
      );
    }

    // 🔒 IDEMPOTENCY CHECK (CRITICAL)
    if (source_id) {
      const { data: existing } = await supabase
        .from("production_logs")
        .select("id")
        .eq("tenant_id", TENANT_ID)
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
    const { data: recipeItems, error: recipeError } = await supabase
      .from("recipe_items")
      .select("*")
      .eq("dish_id", dish_id)
      .eq("tenant_id", TENANT_ID);

    if (recipeError) throw recipeError;

    if (!recipeItems || recipeItems.length === 0) {
      return Response.json(
        { error: "No recipe found" },
        { status: 400 }
      );
    }

    // 🔴 2. VALIDATE ALL INGREDIENTS FIRST
    const ingredientIds = recipeItems.map((r) => r.ingredient_id);

    const { data: ingredients, error: ingredientError } = await supabase
      .from("ingredients")
      .select("id, quantity, cost_per_unit, name")
      .eq("tenant_id", TENANT_ID)
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

    // 🔹 3. PROCESS ALL INGREDIENTS (SAFE LOOP)
    for (const recipeItem of recipeItems) {
      const requiredQty =
        Number(recipeItem.quantity || 0) * Number(quantity);

      const ingredient = ingredientMap[recipeItem.ingredient_id];

      const unitCost = Number(ingredient?.cost_per_unit || 0);
      const cost = unitCost * requiredQty;

      totalCost += cost;

      // 🔥 ATOMIC STOCK DEDUCTION
      const { error: stockError } = await supabase.rpc(
        "decrement_ingredient_stock",
        {
          p_tenant_id: TENANT_ID,
          p_ingredient_id: recipeItem.ingredient_id,
          p_qty: requiredQty,
        }
      );

      if (stockError) {
        throw new Error("Stock deduction failed");
      }

      // 🔥 LOG EACH INGREDIENT USAGE
      await supabase.from("production_logs").insert({
        tenant_id: TENANT_ID,
        dish_id,
        ingredient_id: recipeItem.ingredient_id,
        quantity_used: requiredQty,
        source_id: source_id || null,
      });
    }

    // 🔹 4. INCREASE DISH STOCK
    const { error: dishStockError } = await supabase.rpc(
      "increment_dish_stock",
      {
        p_tenant_id: TENANT_ID,
        p_dish_id: dish_id,
        p_qty: quantity,
      }
    );

    if (dishStockError) {
      throw new Error("Dish stock update failed");
    }

    // 🔹 5. RETURN RESULT
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