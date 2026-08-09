export const dynamic = "force-dynamic";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  businessDayRange,
  resolveOrganizationTimeContext,
} from "@/lib/shared/time/organizationTime";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: searchParams.get("organizationId"),
      request,
    });

    if (!access.success) {
      return Response.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const organizationId = access.organizationId;
    const timeContext = await resolveOrganizationTimeContext({
      organizationId,
    });
    const day = businessDayRange(timeContext.timezone);

    const [
      salesResult,
      dishesResult,
      recipesResult,
      ingredientsResult,
      stockResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("daily_sales_items")
        .select("dish_id,quantity,price")
        .eq("organization_id", organizationId)
        .gte("created_at", day.start)
        .lt("created_at", day.nextStart),
      supabaseAdmin
        .from("dishes")
        .select("id,name")
        .eq("organization_id", organizationId),
      supabaseAdmin
        .from("recipes")
        .select(`
          dish_id,
          recipe_items (
            item_id,
            quantity
          )
        `)
        .eq("organization_id", organizationId),
      supabaseAdmin
        .from("ingredients")
        .select("id,cost_per_unit")
        .eq("organization_id", organizationId),
      supabaseAdmin
        .from("production_batches")
        .select("dish_id,remaining_quantity")
        .eq("organization_id", organizationId),
    ]);

    for (const result of [
      salesResult,
      dishesResult,
      recipesResult,
      ingredientsResult,
      stockResult,
    ]) {
      if (result.error) {
        throw result.error;
      }
    }

    const sales = salesResult.data || [];
    const dishes = dishesResult.data || [];
    const recipes = recipesResult.data || [];
    const ingredients = ingredientsResult.data || [];
    const stock = stockResult.data || [];

    const dishMap = Object.fromEntries(
      dishes.map((dish) => [dish.id, dish.name])
    );

    const ingredientCostMap = Object.fromEntries(
      ingredients.map((ingredient) => [
        ingredient.id,
        Number(ingredient.cost_per_unit || 0),
      ])
    );

    const recipeCostMap = {};

    for (const recipe of recipes) {
      const dishId = recipe.dish_id;
      recipeCostMap[dishId] = recipeCostMap[dishId] || 0;

      for (const item of recipe.recipe_items || []) {
        recipeCostMap[dishId] +=
          Number(ingredientCostMap[item.item_id] || 0) *
          Number(item.quantity || 0);
      }
    }

    let revenue = 0;
    let cost = 0;
    const dishResults = {};

    for (const sale of sales) {
      const dishId = sale.dish_id;
      const quantity = Number(sale.quantity || 0);
      const price = Number(sale.price || 0);
      const saleRevenue = quantity * price;
      const unitCost = Number(recipeCostMap[dishId] || 0);
      const saleCost = unitCost * quantity;
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

      dishResults[dishId].sold += quantity;
      dishResults[dishId].revenue += saleRevenue;
      dishResults[dishId].cost += saleCost;
      dishResults[dishId].profit += profit;

      revenue += saleRevenue;
      cost += saleCost;
    }

    const dishRows = Object.values(dishResults).map((dish) => ({
      ...dish,
      margin:
        dish.revenue > 0
          ? Math.round((dish.profit / dish.revenue) * 100)
          : 0,
    }));

    const top = [...dishRows]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    const worst = [...dishRows]
      .sort((a, b) => a.profit - b.profit)
      .slice(0, 5);

    const stockMap = {};

    for (const row of stock) {
      stockMap[row.dish_id] =
        Number(stockMap[row.dish_id] || 0) +
        Number(row.remaining_quantity || 0);
    }

    const lowStock = Object.entries(stockMap)
      .filter(([, quantity]) => quantity <= 5)
      .map(([dishId, quantity]) => ({
        name: dishMap[dishId] || dishId,
        quantity,
      }));

    return Response.json({
      success: true,
      organizationId,
      timezone: timeContext.timezone,
      businessDate: day.businessDate,
      revenue,
      cost,
      profit: revenue - cost,
      margin:
        revenue > 0
          ? Math.round(((revenue - cost) / revenue) * 100)
          : 0,
      top,
      worst,
      lowStock,
    });
  } catch (error) {
    console.error("OWNER_REAL_COST_ERROR", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "Unable to load owner profitability",
      },
      {
        status: 500,
      }
    );
  }
}
