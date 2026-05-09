import { createClient } from "@supabase/supabase-js";



export async function POST(req) {
  const startTime = Date.now();

  try {
    const body = await req.json();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
    const {
      tenant_id,
      dish_id,
      quantity,
      source_id,
      created_by
    } = body;

    // =========================
    // 1. VALIDATION
    // =========================
    if (!tenant_id || !dish_id || !quantity) {
      return Response.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (Number(quantity) <= 0) {
      return Response.json(
        { success: false, error: "Quantity must be greater than 0" },
        { status: 400 }
      );
    }

    // =========================
    // 2. LOAD DISH (price needed now)
    // =========================
    const { data: dish, error: dishError } = await supabase
      .from("dishes")
      .select("id, name, price")
      .eq("id", dish_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (dishError || !dish) {
      return Response.json(
        { success: false, error: "Dish not found" },
        { status: 404 }
      );
    }

    // =========================
    // 3. LOAD RECIPE
    // =========================
    const { data: recipe, error: recipeError } = await supabase
      .from("recipe_items")
      .select("ingredient_id, quantity")
      .eq("tenant_id", tenant_id)
      .eq("dish_id", dish_id);

    if (recipeError) {
      return Response.json(
        { success: false, error: "Failed to load recipe" },
        { status: 500 }
      );
    }

    if (!recipe || recipe.length === 0) {
      return Response.json(
        { success: false, error: "No recipe defined for this dish" },
        { status: 400 }
      );
    }

    // =========================
    // 4. ATOMIC PRODUCTION
    // =========================
    const { error: rpcError } = await supabase.rpc("run_production_atomic", {
      p_tenant_id: tenant_id,
      p_dish_id: dish_id,
      p_quantity: Number(quantity)
    });

    if (rpcError) {
      return Response.json(
        { success: false, error: rpcError.message },
        { status: 400 }
      );
    }

    // =========================
    // 5. CALCULATE COST
    // =========================
    let totalCost = 0;

    for (const item of recipe) {
      const { data: ingredient } = await supabase
        .from("ingredients")
        .select("cost")
        .eq("id", item.ingredient_id)
        .single();

      const unitCost = Number(ingredient?.cost || 0);
      const needed = Number(item.quantity) * Number(quantity);

      totalCost += unitCost * needed;
    }

    // =========================
    // 6. PROFIT CALCULATION
    // =========================
    const dishPrice = Number(dish.price || 0);
    const totalRevenue = dishPrice * Number(quantity);
    const profit = totalRevenue - totalCost;
    const margin = totalRevenue > 0
      ? (profit / totalRevenue) * 100
      : 0;

    // =========================
    // 7. LOG PRODUCTION
    // =========================
    const { error: logError } = await supabase
      .from("production_logs")
      .insert({
        tenant_id,
        dish_id,
        quantity: Number(quantity),
        cost: totalCost,
        revenue: totalRevenue,
        profit: profit,
        margin: margin,
        source_id: source_id || null,
        created_by: created_by || null
      });

    if (logError) {
      console.error("LOG ERROR:", logError);
    }

    // =========================
    // 8. RESPONSE
    // =========================
    return Response.json({
      success: true,
      message: "Production completed",
      dish: {
        id: dish.id,
        name: dish.name
      },
      quantity: Number(quantity),
      total_cost: totalCost,
      revenue: totalRevenue,
      profit: profit,
      margin: margin,
      duration_ms: Date.now() - startTime
    });

  } catch (err) {
    console.error("PRODUCTION API ERROR:", err);

    return Response.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}