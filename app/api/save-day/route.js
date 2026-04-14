import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sanitizeDate(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyMatch.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString().slice(0, 10);
}

function buildSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(req) {
  try {
    const body = await req.json();

    const salesDate = sanitizeDate(body?.sales_date ?? body?.salesDate);
    const rawItems = Array.isArray(body?.items) ? body.items : [];

    if (!salesDate) {
      return NextResponse.json(
        { error: "Invalid or missing sales date" },
        { status: 400 }
      );
    }

    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: "At least one sales item is required" },
        { status: 400 }
      );
    }

    const cleanedItems = rawItems
      .map((item) => {
        const dishId = typeof item?.dish_id === "string"
          ? item.dish_id.trim()
          : typeof item?.dishId === "string"
          ? item.dishId.trim()
          : "";

        const quantity = toNumber(item?.quantity, 0);
        const price = item?.price === "" || item?.price == null
          ? null
          : toNumber(item.price, null);

        return {
          dish_id: dishId,
          quantity,
          price,
        };
      })
      .filter((item) => item.quantity > 0);

    if (cleanedItems.length === 0) {
      return NextResponse.json(
        { error: "All item quantities are empty or invalid" },
        { status: 400 }
      );
    }

    const invalidUuidItem = cleanedItems.find((item) => !isValidUuid(item.dish_id));
    if (invalidUuidItem) {
      return NextResponse.json(
        {
          error:
            "Invalid dish_id detected. Save blocked before database insert.",
        },
        { status: 400 }
      );
    }

    const dishIds = [...new Set(cleanedItems.map((item) => item.dish_id))];
    const supabase = buildSupabaseAdmin();

    const { data: dishes, error: dishesError } = await supabase
      .from("dishes")
      .select("id, name, price")
      .in("id", dishIds);

    if (dishesError) {
      return NextResponse.json(
        { error: dishesError.message },
        { status: 500 }
      );
    }

    const dishMap = new Map((dishes || []).map((dish) => [dish.id, dish]));

    const missingDishIds = dishIds.filter((id) => !dishMap.has(id));
    if (missingDishIds.length > 0) {
      return NextResponse.json(
        { error: "One or more dishes do not exist in the database" },
        { status: 400 }
      );
    }

    const { data: recipes, error: recipesError } = await supabase
      .from("recipes")
      .select("dish_id, ingredient_id, qty_per_dish")
      .in("dish_id", dishIds);

    if (recipesError) {
      return NextResponse.json(
        { error: recipesError.message },
        { status: 500 }
      );
    }

    const ingredientIds = [
      ...new Set(
        (recipes || [])
          .map((recipe) => recipe.ingredient_id)
          .filter((id) => isValidUuid(id))
      ),
    ];

    let ingredientMap = new Map();

    if (ingredientIds.length > 0) {
      const { data: ingredients, error: ingredientsError } = await supabase
        .from("ingredients")
        .select("id, name, cost_per_unit")
        .in("id", ingredientIds);

      if (ingredientsError) {
        return NextResponse.json(
          { error: ingredientsError.message },
          { status: 500 }
        );
      }

      ingredientMap = new Map(
        (ingredients || []).map((ingredient) => [ingredient.id, ingredient])
      );
    }

    const recipeCostByDishId = new Map();

    for (const dishId of dishIds) {
      recipeCostByDishId.set(dishId, 0);
    }

    for (const recipe of recipes || []) {
      const ingredient = ingredientMap.get(recipe.ingredient_id);
      if (!ingredient) continue;

      const qtyPerDish = toNumber(recipe.qty_per_dish, 0);
      const costPerUnit = toNumber(ingredient.cost_per_unit, 0);
      const recipeLineCost = qtyPerDish * costPerUnit;

      const current = recipeCostByDishId.get(recipe.dish_id) || 0;
      recipeCostByDishId.set(recipe.dish_id, current + recipeLineCost);
    }

    const salesItemsToInsert = cleanedItems.map((item) => {
      const dish = dishMap.get(item.dish_id);
      const unitPrice =
        item.price != null ? toNumber(item.price, 0) : toNumber(dish.price, 0);
      const unitCost = recipeCostByDishId.get(item.dish_id) || 0;

      const revenue = round2(unitPrice * item.quantity);
      const cost = round2(unitCost * item.quantity);

      return {
        dish_id: item.dish_id,
        quantity: item.quantity,
        price: round2(unitPrice),
        revenue,
        cost,
      };
    });

    const totalRevenue = round2(
      salesItemsToInsert.reduce((sum, item) => sum + item.revenue, 0)
    );
    const totalCost = round2(
      salesItemsToInsert.reduce((sum, item) => sum + item.cost, 0)
    );
    const totalProfit = round2(totalRevenue - totalCost);
    const foodCostPercent =
      totalRevenue > 0 ? round2((totalCost / totalRevenue) * 100) : 0;

    const batchPayload = {
      sales_date: salesDate,
      total_revenue: totalRevenue,
      total_cost: totalCost,
      total_profit: totalProfit,
      food_cost_percent: foodCostPercent,
    };

    const { data: batch, error: batchError } = await supabase
      .from("daily_sales_batches")
      .insert(batchPayload)
      .select("id")
      .single();

    if (batchError) {
      return NextResponse.json(
        { error: batchError.message },
        { status: 500 }
      );
    }

    if (!batch?.id || !isValidUuid(batch.id)) {
      return NextResponse.json(
        { error: "Batch insert failed: invalid batch id returned" },
        { status: 500 }
      );
    }

    const itemPayload = salesItemsToInsert.map((item) => ({
      batch_id: batch.id,
      dish_id: item.dish_id,
      quantity: item.quantity,
      price: item.price,
      revenue: item.revenue,
      cost: item.cost,
    }));

    const { error: itemsError } = await supabase
      .from("daily_sales_items")
      .insert(itemPayload);

    if (itemsError) {
      await supabase.from("daily_sales_batches").delete().eq("id", batch.id);

      return NextResponse.json(
        { error: itemsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      batch_id: batch.id,
      summary: {
        sales_date: salesDate,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        total_profit: totalProfit,
        food_cost_percent: foodCostPercent,
      },
      items: itemPayload,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}