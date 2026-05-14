"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

const LOW_STOCK_LIMIT = 5;
const TARGET_STOCK = 10;

function normalizeId(value) {
  return String(value || "").trim();
}

export default function ProductionPage() {
  const [tenantId, setTenantId] = useState(null);
  const [lowDishes, setLowDishes] = useState([]);
  const [plan, setPlan] = useState({});
  const [recipes, setRecipes] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [dishStock, setDishStock] = useState([]);
  const [ingredientStock, setIngredientStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [canProduce, setCanProduce] = useState(true);
  const [ingredientSummary, setIngredientSummary] = useState([]);
  const [totalCost, setTotalCost] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [margin, setMargin] = useState(0);

  useEffect(() => {
    const loadTenant = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("staff_accounts")
        .select("tenant_id")
        .eq("auth_user_id", user.id)
        .single();

      if (error || !data?.tenant_id) {
        console.error("TENANT LOAD ERROR:", error);
        return;
      }

      setTenantId(data.tenant_id);
    };

    loadTenant();
  }, []);

  const loadData = async () => {
    if (!tenantId) return;

    try {
      const [
        dishStockRes,
        dishesRes,
        ingredientStockRes,
        recipesRes,
        ingredientsRes,
      ] = await Promise.all([
        supabase
          .from("dish_stock")
          .select("dish_id, quantity")
          .eq("tenant_id", tenantId),

        supabase
          .from("dishes")
          .select("id, name, price")
          .eq("tenant_id", tenantId),

        supabase
          .from("ingredient_stock")
          .select("ingredient_id, quantity")
          .eq("tenant_id", tenantId),

        supabase
          .from("recipe_matrix")
          .select("dish_id, ingredient_id, ingredient_name, quantity")
          .eq("tenant_id", tenantId),

        supabase
          .from("ingredients")
          .select("id, name, cost_per_unit")
          .eq("tenant_id", tenantId),
      ]);

      if (dishStockRes.error) throw dishStockRes.error;
      if (dishesRes.error) throw dishesRes.error;
      if (ingredientStockRes.error) throw ingredientStockRes.error;
      if (recipesRes.error) throw recipesRes.error;
      if (ingredientsRes.error) throw ingredientsRes.error;

      const dishStockData = dishStockRes.data || [];
      const dishesData = dishesRes.data || [];
      const ingredientStockData = ingredientStockRes.data || [];
      const recipesData = recipesRes.data || [];
      const ingredientsData = ingredientsRes.data || [];

      setRecipes(recipesData);
      setIngredients(ingredientsData);
      setDishStock(dishStockData);
      setIngredientStock(ingredientStockData);

      const recipeDishIds = new Set(
        recipesData.map((recipe) => normalizeId(recipe.dish_id))
      );

      const low = dishStockData
        .filter((row) => Number(row.quantity || 0) <= LOW_STOCK_LIMIT)
        .map((row) => {
          const dishId = normalizeId(row.dish_id);
          const dish = dishesData.find((item) => normalizeId(item.id) === dishId);
          const currentQty = Number(row.quantity || 0);
          const hasRecipe = recipeDishIds.has(dishId);

          return {
            dish_id: dishId,
            name: dish?.name || "Unknown",
            price: Number(dish?.price || 0),
            quantity: currentQty,
            suggested: hasRecipe ? Math.max(TARGET_STOCK - currentQty, 5) : 0,
            hasRecipe,
          };
        });

      setLowDishes(low);

      const initialPlan = {};
      low.forEach((dish) => {
        if (dish.hasRecipe) {
          initialPlan[dish.dish_id] = dish.suggested;
        }
      });

      setPlan(initialPlan);
    } catch (err) {
      console.error("PRODUCTION LOAD ERROR:", err);
    }
  };

  useEffect(() => {
    if (!tenantId) return;

    loadData();

    const channel = supabase
      .channel("production-stock-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dish_stock",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          loadData();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ingredient_stock",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  const productionSummary = useMemo(() => {
    const ingredientById = {};
    const stockByIngredientId = {};
    const recipeByDishId = {};
    const dishById = {};

    ingredients.forEach((ingredient) => {
      ingredientById[normalizeId(ingredient.id)] = ingredient;
    });

    ingredientStock.forEach((stock) => {
      stockByIngredientId[normalizeId(stock.ingredient_id)] = Number(
        stock.quantity || 0
      );
    });

    recipes.forEach((recipe) => {
      const dishId = normalizeId(recipe.dish_id);
      if (!recipeByDishId[dishId]) recipeByDishId[dishId] = [];
      recipeByDishId[dishId].push(recipe);
    });

    lowDishes.forEach((dish) => {
      dishById[normalizeId(dish.dish_id)] = dish;
    });

    let cost = 0;
    let revenue = 0;
    let valid = true;
    const summary = {};

    Object.entries(plan).forEach(([rawDishId, rawQty]) => {
      const dishId = normalizeId(rawDishId);
      const produceQty = Number(rawQty || 0);
      if (produceQty <= 0) return;

      const dish = dishById[dishId];
      if (!dish?.hasRecipe) return;

      revenue += Number(dish.price || 0) * produceQty;

      const recipeItems = recipeByDishId[dishId] || [];

      recipeItems.forEach((recipeItem) => {
        const ingredientId = normalizeId(recipeItem.ingredient_id);
        const ingredient = ingredientById[ingredientId];
        const ingredientCost = Number(ingredient?.cost_per_unit || 0);
        const recipeQty = Number(recipeItem.quantity || 0);
        const requiredQty = recipeQty * produceQty;

        cost += ingredientCost * requiredQty;

        if (!summary[ingredientId]) {
          summary[ingredientId] = {
            name: recipeItem.ingredient_name || ingredient?.name || "Unknown",
            needed: 0,
            available: stockByIngredientId[ingredientId] || 0,
          };
        }

        summary[ingredientId].needed += requiredQty;
      });
    });

    const summaryArray = Object.values(summary).map((item) => {
      const ok = Number(item.available || 0) >= Number(item.needed || 0);
      if (!ok) valid = false;
      return { ...item, ok };
    });

    const profit = revenue - cost;
    const marginValue = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : "0.0";

    return {
      ingredientSummary: summaryArray,
      totalCost: cost,
      totalRevenue: revenue,
      totalProfit: profit,
      margin: marginValue,
      canProduce: valid,
    };
  }, [plan, lowDishes, recipes, ingredients, ingredientStock]);

  useEffect(() => {
    setIngredientSummary(productionSummary.ingredientSummary);
    setTotalCost(productionSummary.totalCost);
    setTotalRevenue(productionSummary.totalRevenue);
    setTotalProfit(productionSummary.totalProfit);
    setMargin(productionSummary.margin);
    setCanProduce(productionSummary.canProduce);
  }, [productionSummary]);

  const runBatchProduction = async () => {
    if (loading || !canProduce) return;

    const entries = Object.entries(plan).filter(([dishId, qty]) => {
      const dish = lowDishes.find(
        (item) => normalizeId(item.dish_id) === normalizeId(dishId)
      );

      return dish?.hasRecipe && Number(qty || 0) > 0;
    });

    if (entries.length === 0) {
      alert("No valid production planned");
      return;
    }

    setLoading(true);

    try {
      for (const [dishId, qty] of entries) {
        const response = await fetch("/api/production/batch/produce", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tenantId,
            dishId,
            quantity: Number(qty),
            referenceId: crypto.randomUUID(),
          }),
        });

        const result = await response.json();

        if (!result.success || !result.result?.success) {
          console.error(result);
          alert(result?.result?.error || "Production failed");
          setLoading(false);
          return;
        }
      }

      alert("✅ Production completed");
      await loadData();
    } catch (err) {
      console.error(err);
      alert("Production failed");
    }

    setLoading(false);
  };

  const validProductionCount = lowDishes.filter((dish) => dish.hasRecipe).length;
  const blockedProductionCount = lowDishes.filter((dish) => !dish.hasRecipe).length;

  return (
    <div className="p-6 text-white bg-black min-h-screen max-w-xl mx-auto">
      <h1 className="text-3xl mb-2 font-bold">Morning Production</h1>

      <div className="text-sm text-gray-400 mb-6">
        Ready: {validProductionCount} | Blocked: {blockedProductionCount}
      </div>

      {lowDishes.length === 0 && (
        <div className="bg-gray-900 p-4 rounded text-gray-400">
          No low dish stock.
        </div>
      )}

      {lowDishes.map((dish) => (
        <div
          key={dish.dish_id}
          className={`flex justify-between p-4 mb-3 rounded ${
            dish.hasRecipe ? "bg-gray-900" : "bg-red-950 border border-red-700"
          }`}
        >
          <div>
            <p className="text-lg font-semibold">{dish.name}</p>

            <p className="text-sm text-gray-400">
              Stock: {dish.quantity} | Price: ฿{dish.price}
            </p>

            {!dish.hasRecipe && (
              <p className="text-sm text-red-400 mt-1">
                Recipe Missing • Cannot Produce
              </p>
            )}
          </div>

          <input
            type="number"
            min="0"
            disabled={!dish.hasRecipe}
            value={plan[dish.dish_id] || 0}
            onChange={(e) =>
              setPlan({
                ...plan,
                [dish.dish_id]: Number(e.target.value),
              })
            }
            className={`w-20 text-black px-2 py-1 rounded ${
              !dish.hasRecipe ? "opacity-40 cursor-not-allowed" : ""
            }`}
          />
        </div>
      ))}

      <div className="bg-gray-900 p-4 mt-4 rounded">
        <h2 className="text-xl mb-3">Ingredients</h2>

        {ingredientSummary.length === 0 && (
          <div className="text-sm text-gray-400">
            No valid production selected.
          </div>
        )}

        {ingredientSummary.map((item) => (
          <div key={item.name} className="flex justify-between text-sm mb-1">
            <span>{item.name}</span>

            <span className={item.ok ? "text-green-400" : "text-red-400"}>
              {item.needed} / {item.available}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 p-4 mt-4 rounded">
        <h2 className="text-xl mb-3">Batch Summary</h2>

        <div className="flex justify-between mb-1">
          <span>Cost</span>
          <span>฿{totalCost.toFixed(2)}</span>
        </div>

        <div className="flex justify-between mb-1">
          <span>Revenue</span>
          <span>฿{totalRevenue.toFixed(2)}</span>
        </div>

        <div className="flex justify-between mb-1">
          <span>Profit</span>
          <span className={totalProfit >= 0 ? "text-green-400" : "text-red-400"}>
            ฿{totalProfit.toFixed(2)}
          </span>
        </div>

        <div className="flex justify-between">
          <span>Margin</span>
          <span>{margin}%</span>
        </div>
      </div>

      <button
        onClick={runBatchProduction}
        disabled={!canProduce || loading || validProductionCount === 0}
        className={`mt-6 w-full py-3 rounded text-lg font-semibold ${
          canProduce && validProductionCount > 0
            ? "bg-green-600 hover:bg-green-500"
            : "bg-red-600"
        }`}
      >
        {loading
          ? "Processing..."
          : validProductionCount === 0
          ? "No Valid Recipes"
          : canProduce
          ? "Produce"
          : "Fix Ingredients"}
      </button>
    </div>
  );
}
