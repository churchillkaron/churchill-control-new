"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

const LOW_STOCK_LIMIT = 5;
const TARGET_STOCK = 10;

export default function ProductionPage() {

  const [tenantId, setTenantId] =
    useState(null);

  const [lowDishes, setLowDishes] =
    useState([]);

  const [plan, setPlan] =
    useState({});

  const [recipes, setRecipes] =
    useState([]);

  const [ingredients, setIngredients] =
    useState([]);

  const [dishStock, setDishStock] =
    useState([]);

  const [ingredientStock, setIngredientStock] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [canProduce, setCanProduce] =
    useState(true);

  const [ingredientSummary, setIngredientSummary] =
    useState([]);

  const [totalCost, setTotalCost] =
    useState(0);

  const [totalRevenue, setTotalRevenue] =
    useState(0);

  const [totalProfit, setTotalProfit] =
    useState(0);

  const [margin, setMargin] =
    useState(0);

  // =========================
  // LOAD TENANT
  // =========================

  useEffect(() => {

    const loadTenant = async () => {

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } =
        await supabase
          .from("staff_accounts")
          .select("tenant_id")
          .eq("auth_user_id", user.id)
          .single();

      if (error || !data?.tenant_id) {

        console.error(
          "TENANT LOAD ERROR:",
          error
        );

        return;

      }

      setTenantId(data.tenant_id);

    };

    loadTenant();

  }, []);

  // =========================
  // LOAD DATA
  // =========================

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
          .select("*")
          .eq("tenant_id", tenantId),

        supabase
          .from("ingredients")
          .select("*")
          .eq("tenant_id", tenantId),

      ]);

      const dishStockData =
        dishStockRes.data || [];

      const dishesData =
        dishesRes.data || [];

      const ingredientStockData =
        ingredientStockRes.data || [];

      const recipesData =
        recipesRes.data || [];

      const ingredientsData =
        ingredientsRes.data || [];

      setRecipes(recipesData);
      setIngredients(ingredientsData);
      setDishStock(dishStockData);
      setIngredientStock(
        ingredientStockData
      );

      const recipeDishIds =
        new Set(
          recipesData.map(
            (r) => r.dish_id
          )
        );

      const low =
        dishStockData
          .filter(
            (d) =>
              Number(
                d.quantity || 0
              ) <= LOW_STOCK_LIMIT
          )
          .map((d) => {

            const dish =
              dishesData.find(
                (x) =>
                  x.id === d.dish_id
              );

            const currentQty =
              Number(
                d.quantity || 0
              );

            const hasRecipe =
              recipeDishIds.has(
                d.dish_id
              );

            return {
              dish_id: d.dish_id,
              name:
                dish?.name ||
                "Unknown",
              price:
                Number(
                  dish?.price || 0
                ),
              quantity:
                currentQty,
              suggested:
                hasRecipe
                  ? Math.max(
                      TARGET_STOCK -
                        currentQty,
                      5
                    )
                  : 0,
              hasRecipe,
            };

          });

      setLowDishes(low);

      const initialPlan = {};

      low.forEach((dish) => {

        if (dish.hasRecipe) {

          initialPlan[
            dish.dish_id
          ] = dish.suggested;

        }

      });

      setPlan(initialPlan);

    } catch (err) {

      console.error(
        "PRODUCTION LOAD ERROR:",
        err
      );

    }

  };

  useEffect(() => {

    if (!tenantId) return;

    loadData();

    const channel = supabase
      .channel(
        "production-stock-sync"
      )
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
      .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };

  }, [tenantId]);

  // =========================
  // MAPS
  // =========================

  const ingredientMap =
    useMemo(() => {

      const map = {};

      for (const ingredient of ingredients) {

        map[ingredient.id] =
          ingredient;

      }

      return map;

    }, [ingredients]);

  const ingredientStockMap =
    useMemo(() => {

      const map = {};

      for (const stock of ingredientStock) {

        map[
          stock.ingredient_id
        ] = Number(
          stock.quantity || 0
        );

      }

      return map;

    }, [ingredientStock]);

  // =========================
  // CALCULATE PLAN
  // =========================

  useEffect(() => {

    const calculate =
      async () => {

        let cost = 0;
        let revenue = 0;
        let valid = true;

        const summary = {};

        for (const [
          dish_id,
          qty,
        ] of Object.entries(plan)) {

          const produceQty =
            Number(qty || 0);

          if (produceQty <= 0)
            continue;

          const dish =
            lowDishes.find(
              (d) =>
                d.dish_id ===
                dish_id
            );

          if (!dish?.hasRecipe)
            continue;

          revenue +=
            Number(
              dish.price || 0
            ) * produceQty;

          const recipeItems =
            recipes.filter(
              (r) =>
                r.dish_id ===
                dish_id
            );

          for (const recipeItem of recipeItems) {

            const ingredient =
              ingredientMap[
                recipeItem
                  .ingredient_id
              ];

            const ingredientCost =
              Number(
                ingredient?.cost_per_unit ||
                  0
              );

            const recipeQty =
              Number(
                recipeItem.quantity ||
                  0
              );

            const requiredQty =
              recipeQty *
              produceQty;

            cost +=
              ingredientCost *
              requiredQty;

            if (
              !summary[
                recipeItem
                  .ingredient_id
              ]
            ) {

              summary[
                recipeItem
                  .ingredient_id
              ] = {
                name:
                  recipeItem
                    .ingredient_name ||
                  ingredient?.name ||
                  "Unknown",
                needed: 0,
                available:
                  ingredientStockMap[
                    recipeItem
                      .ingredient_id
                  ] || 0,
              };

            }

            summary[
              recipeItem
                .ingredient_id
            ].needed +=
              requiredQty;

          }

        }

        const summaryArray =
          Object.values(summary).map(
            (item) => {

              const ok =
                item.available >=
                item.needed;

              if (!ok)
                valid = false;

              return {
                ...item,
                ok,
              };

            }
          );

        const profit =
          revenue - cost;

        const marginValue =
          revenue > 0
            ? (
                (profit /
                  revenue) *
                100
              ).toFixed(1)
            : "0.0";

        setIngredientSummary(
          summaryArray
        );

        setTotalCost(cost);

        setTotalRevenue(revenue);

        setTotalProfit(profit);

        setMargin(marginValue);

        setCanProduce(valid);

      };

    calculate();

  }, [
    plan,
    lowDishes,
    recipes,
    ingredientMap,
    ingredientStockMap,
  ]);

  // =========================
  // PRODUCE
  // =========================

  const runBatchProduction =
    async () => {

      if (
        loading ||
        !canProduce
      )
        return;

      const entries =
        Object.entries(plan).filter(
          ([dish_id, qty]) => {

            const dish =
              lowDishes.find(
                (d) =>
                  d.dish_id ===
                  dish_id
              );

            return (
              dish?.hasRecipe &&
              Number(qty || 0) >
                0
            );

          }
        );

      if (
        entries.length === 0
      ) {

        alert(
          "No valid production planned"
        );

        return;

      }

      setLoading(true);

      try {

        for (const [
          dish_id,
          qty,
        ] of entries) {

          const response =
            await fetch(
              "/api/production/batch/produce",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify({
                  tenantId:
                    tenantId,
                  dishId:
                    dish_id,
                  quantity:
                    Number(qty),
                  referenceId:
                    crypto.randomUUID(),
                }),
              }
            );

          const result =
            await response.json();

          if (
            !result.success ||
            !result.result
              ?.success
          ) {

            console.error(
              result
            );

            alert(
              result?.result
                ?.error ||
                "Production failed"
            );

            setLoading(false);

            return;

          }

        }

        alert(
          "✅ Production completed"
        );

        await loadData();

      } catch (err) {

        console.error(err);

        alert(
          "Production failed"
        );

      }

      setLoading(false);

    };

  // =========================
  // UI
  // =========================

  const validProductionCount =
    lowDishes.filter(
      (d) => d.hasRecipe
    ).length;

  const blockedProductionCount =
    lowDishes.filter(
      (d) => !d.hasRecipe
    ).length;

  return (

    <div className="p-6 text-white bg-black min-h-screen max-w-xl mx-auto">

      <h1 className="text-3xl mb-2 font-bold">
        Morning Production
      </h1>

      <div className="text-sm text-gray-400 mb-6">

        Ready:
        {" "}
        {validProductionCount}
        {" "}
        |
        {" "}
        Blocked:
        {" "}
        {blockedProductionCount}

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
            dish.hasRecipe
              ? "bg-gray-900"
              : "bg-red-950 border border-red-700"
          }`}
        >

          <div>

            <p className="text-lg font-semibold">
              {dish.name}
            </p>

            <p className="text-sm text-gray-400">

              Stock:
              {" "}
              {dish.quantity}
              {" "}
              |
              {" "}
              Price:
              {" "}
              ฿
              {dish.price}

            </p>

            {!dish.hasRecipe && (

              <p className="text-sm text-red-400 mt-1">

                Recipe Missing • Cannot Produce

              </p>

            )}

          </div>

          <input
            type="number"
            disabled={!dish.hasRecipe}
            value={
              plan[
                dish.dish_id
              ] || 0
            }
            onChange={(e) =>
              setPlan({
                ...plan,
                [dish.dish_id]:
                  Number(
                    e.target.value
                  ),
              })
            }
            className={`w-20 text-black px-2 py-1 rounded ${
              !dish.hasRecipe
                ? "opacity-40 cursor-not-allowed"
                : ""
            }`}
          />

        </div>

      ))}

      <div className="bg-gray-900 p-4 mt-4 rounded">

        <h2 className="text-xl mb-3">
          Ingredients
        </h2>

        {ingredientSummary.length ===
          0 && (

          <div className="text-sm text-gray-400">

            No valid production selected.

          </div>

        )}

        {ingredientSummary.map(
          (i, index) => (

            <div
              key={index}
              className="flex justify-between text-sm mb-1"
            >

              <span>
                {i.name}
              </span>

              <span
                className={
                  i.ok
                    ? "text-green-400"
                    : "text-red-400"
                }
              >

                {i.needed}
                {" / "}
                {i.available}

              </span>

            </div>

          )
        )}

      </div>

      <div className="bg-gray-900 p-4 mt-4 rounded">

        <h2 className="text-xl mb-3">
          Batch Summary
        </h2>

        <div className="flex justify-between mb-1">

          <span>Cost</span>

          <span>
            ฿
            {totalCost.toFixed(
              2
            )}
          </span>

        </div>

        <div className="flex justify-between mb-1">

          <span>Revenue</span>

          <span>
            ฿
            {totalRevenue.toFixed(
              2
            )}
          </span>

        </div>

        <div className="flex justify-between mb-1">

          <span>Profit</span>

          <span
            className={
              totalProfit >= 0
                ? "text-green-400"
                : "text-red-400"
            }
          >

            ฿
            {totalProfit.toFixed(
              2
            )}

          </span>

        </div>

        <div className="flex justify-between">

          <span>Margin</span>

          <span>
            {margin}%
          </span>

        </div>

      </div>

      <button
        onClick={
          runBatchProduction
        }
        disabled={
          !canProduce ||
          loading ||
          validProductionCount ===
            0
        }
        className={`mt-6 w-full py-3 rounded text-lg font-semibold ${
          canProduce &&
          validProductionCount >
            0
            ? "bg-green-600 hover:bg-green-500"
            : "bg-red-600"
        }`}
      >

        {loading
          ? "Processing..."
          : validProductionCount ===
            0
          ? "No Valid Recipes"
          : canProduce
          ? "Produce"
          : "Fix Ingredients"}

      </button>

    </div>

  );

}
