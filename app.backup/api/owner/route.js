export const dynamic = "force-dynamic";

import { supabase } from "@/lib/shared/supabase/client";

export async function GET() {
  const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  try {
    const now = new Date();
    const start = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const end = new Date(now.setHours(23, 59, 59, 999)).toISOString();

    const { data: sales } = await supabase
      .from("daily_sales_items")
      .select("dish_id, quantity, price")
      .eq("tenant_id", tenant_id)
      .gte("created_at", start)
      .lte("created_at", end);

    const { data: dishes } = await supabase
      .from("dishes")
      .select("id, name")
      .eq("tenant_id", tenant_id);

    // get recipes with dish mapping
const { data: recipes } = await supabase
  .from("recipes")
  .select(`
    dish_id,
    recipe_items (
      ingredient_id,
      quantity
    )
  `)
  .eq("tenant_id", tenant_id);

    const { data: ingredients } = await supabase
      .from("ingredients")
      .select("id, cost_per_unit")
      .eq("tenant_id", tenant_id);

    const dishMap = {};
    for (const d of dishes || []) {
      dishMap[d.id] = d.name;
    }

    const ingredientCostMap = {};
    for (const i of ingredients || []) {
      ingredientCostMap[i.id] = Number(i.cost_per_unit || 0);
    }

   const recipeCostMap = {};

for (const r of recipes || []) {
  const dishId = r.dish_id;

  if (!recipeCostMap[dishId]) recipeCostMap[dishId] = 0;

  for (const item of r.recipe_items || []) {
    const ingredientCost = ingredientCostMap[item.ingredient_id] || 0;
    const recipeQty = Number(item.quantity || 0);

    recipeCostMap[dishId] += ingredientCost * recipeQty;
  }
}

    let revenue = 0;
    let cost = 0;

    const dishResults = {};

    for (const s of sales || []) {
      const dishId = s.dish_id;
      const qty = Number(s.quantity || 0);
      const price = Number(s.price || 0);

      const saleRevenue = qty * price;
      const unitCost = recipeCostMap[dishId] || 0;
      const saleCost = unitCost * qty;
      const profit = saleRevenue - saleCost;

      if (!dishResults[dishId]) {
        dishResults[dishId] = {
          dish_id: dishId,
          name: dishMap[dishId] || dishId,
          sold: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        };
      }

      dishResults[dishId].sold += qty;
      dishResults[dishId].revenue += saleRevenue;
      dishResults[dishId].cost += saleCost;
      dishResults[dishId].profit += profit;

      revenue += saleRevenue;
      cost += saleCost;
    }

    const dishesArr = Object.values(dishResults).map((d) => ({
      ...d,
      margin:
        d.revenue > 0
          ? Math.round((d.profit / d.revenue) * 100)
          : 0,
    }));

    const top = [...dishesArr]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    const worst = [...dishesArr]
      .sort((a, b) => a.profit - b.profit)
      .slice(0, 5);

    const { data: stock } = await supabase
      .from("dish_stock")
      .select("dish_id, quantity")
      .eq("tenant_id", tenant_id);

    const lowStock = (stock || [])
      .filter((d) => Number(d.quantity) <= 5)
      .map((d) => ({
        name: dishMap[d.dish_id] || d.dish_id,
        quantity: d.quantity,
      }));

    return Response.json({
      success: true,
      revenue,
      cost,
      profit: revenue - cost,
      margin: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : 0,
      top,
      worst,
      lowStock,
    });
  } catch (err) {
    console.error("OWNER REAL COST ERROR:", err);

    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}