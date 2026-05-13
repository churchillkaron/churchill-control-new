"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

const TENANT_ID = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function ProductionPage() {
  const [lowDishes, setLowDishes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState({});
  const [stockMap, setStockMap] = useState({});
  const [ingredientSummary, setIngredientSummary] = useState([]);
  const [canProduce, setCanProduce] = useState(true);

  // ✅ NEW (profit layer only)
  const [totalCost, setTotalCost] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [margin, setMargin] = useState(0);

  // =========================
  // LOAD DATA (UNCHANGED)
  // =========================
  const loadLowDishes = async () => {
    try {
      const { data: dishStock } = await supabase
        .from("dish_stock")
        .select("dish_id, quantity")
        .eq("tenant_id", TENANT_ID);

      const { data: dishes } = await supabase
        .from("dishes")
        .select("id, name, price")
        .eq("tenant_id", TENANT_ID);

      const { data: ingredientStock } = await supabase
        .from("ingredient_stock")
        .select("ingredient_id, quantity")
        .eq("tenant_id", TENANT_ID);

        const { data: recipes } = await supabase
  .from("recipe_matrix")
  .select("dish_id")
  .eq("tenant_id", TENANT_ID);

const recipeDishIds = new Set(
  (recipes || []).map(r => r.dish_id)
);

      const dishMap = {};
      const priceMap = {};

      for (const d of dishes || []) {
        dishMap[d.id] = d.name;
        priceMap[d.id] = Number(d.price || 0);
      }

      const stock = {};
      for (const s of ingredientStock || []) {
        stock[s.ingredient_id] = Number(s.quantity || 0);
      }

      setStockMap(stock);

      const low = (dishStock || [])
       .filter(
  (d) =>
    Number(d.quantity) <= 5 &&
    recipeDishIds.has(d.dish_id)
)
        .map((d) => {
          const qty = Number(d.quantity || 0);

          return {
            dish_id: d.dish_id,
            name: dishMap[d.dish_id] || "Unknown",
            price: priceMap[d.dish_id] || 0,
            quantity: qty,
            suggested: Math.max(10 - qty, 5),
          };
        });

      setLowDishes(low);

      const initialPlan = {};
      low.forEach((d) => {
        initialPlan[d.dish_id] = d.suggested;
      });

      setPlan(initialPlan);
    } catch (err) {
      console.error("LOAD ERROR:", err);
    }
  };

  useEffect(() => {
    loadLowDishes();

    const channel = supabase
      .channel("production-dish-stock")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dish_stock",
          filter: `tenant_id=eq.${TENANT_ID}`,
        },
        () => {
          loadLowDishes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // =========================
  // CALCULATE INGREDIENTS (EXTENDED ONLY)
  // =========================
  const calculateIngredients = async (plan) => {
    const summary = {};
    let cost = 0;
    let revenue = 0;

    for (const [dish_id, qty] of Object.entries(plan)) {
      if (!qty || qty <= 0) continue;

      const dish = lowDishes.find(d => d.dish_id === dish_id);
      revenue += (dish?.price || 0) * qty;

      const res = await fetch("/api/recipes/by-dish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dish_id }),
      });

      const recipe = await res.json();

      for (const item of recipe) {
        const total = item.quantity * qty;

        if (!summary[item.ingredient_id]) {
          summary[item.ingredient_id] = {
            name: item.name,
            needed: 0,
            cost: item.cost || 0,
          };
        }

        summary[item.ingredient_id].needed += total;
        cost += (item.cost || 0) * total;
      }
    }

    // ✅ NEW
    const profit = revenue - cost;
    const marginValue = revenue > 0 ? (profit / revenue) * 100 : 0;

    setTotalCost(cost);
    setTotalRevenue(revenue);
    setTotalProfit(profit);
    setMargin(marginValue);

    return summary;
  };

  // =========================
  // VALIDATION (UNCHANGED)
  // =========================
  const evaluatePlan = async () => {
    const summary = await calculateIngredients(plan);

    let valid = true;

    const result = Object.entries(summary).map(([id, data]) => {
      const available = stockMap[id] || 0;

      if (data.needed > available) valid = false;

      return {
        ...data,
        available,
        ok: data.needed <= available,
      };
    });

    setIngredientSummary(result);
    setCanProduce(valid);
  };

  useEffect(() => {
    evaluatePlan();
  }, [plan, stockMap]);

  // =========================
  // PRODUCTION (UNCHANGED)
  // =========================
  const runBatchProduction = async () => {
    if (loading || !canProduce) return;

    const entries = Object.entries(plan).filter(([_, qty]) => qty > 0);

    if (entries.length === 0) {
      alert("No production planned");
      return;
    }

    setLoading(true);

try {
  for (const [dish_id, qty] of entries) {
    const response = await fetch("/api/production/batch/produce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: TENANT_ID,
        dishId: dish_id,
        quantity: Number(qty),
        referenceId: crypto.randomUUID(),
      }),
    });

    const result = await response.json();

    if (!result.success || !result.result?.success) {
      console.error(result);

      alert(
        result?.result?.error ||
        "Production failed"
      );

      return;
    }
  }

  alert("✅ Production completed");

  setPlan({});

  await loadLowDishes();

} catch (err) {
  console.error(err);

  alert("Production failed");
}

setLoading(false);
  };

  // =========================
  // UI (ONLY EXTENDED)
  // =========================
  return (
    <div className="p-6 text-white bg-black min-h-screen max-w-xl mx-auto">
      <h1 className="text-2xl mb-6">Morning Production</h1>

      {lowDishes.map((dish) => (
        <div key={dish.dish_id} className="flex justify-between bg-gray-900 p-4 mb-3 rounded">
          <div>
            <p>{dish.name}</p>
            <p className="text-sm text-gray-400">
              Stock: {dish.quantity} | Price: {dish.price}
            </p>
          </div>

          <input
            type="number"
            value={plan[dish.dish_id] || 0}
            onChange={(e) =>
              setPlan({
                ...plan,
                [dish.dish_id]: Number(e.target.value),
              })
            }
            className="w-20 text-black px-2 py-1 rounded"
          />
        </div>
      ))}

      <div className="bg-gray-900 p-4 mt-4 rounded">
        <h2>Ingredients</h2>
        {ingredientSummary.map((i, index) => (
          <div key={index} className="flex justify-between text-sm">
            <span>{i.name}</span>
            <span className={i.ok ? "text-green-400" : "text-red-400"}>
              {i.needed} / {i.available}
            </span>
          </div>
        ))}
      </div>

      {/* ✅ NEW PROFIT BOX ONLY */}
      <div className="bg-gray-900 p-4 mt-4 rounded">
        <h2>Batch Summary</h2>
        <div className="flex justify-between"><span>Cost</span><span>{totalCost.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>Revenue</span><span>{totalRevenue.toFixed(2)}</span></div>
        <div className="flex justify-between">
          <span>Profit</span>
          <span className={totalProfit >= 0 ? "text-green-400" : "text-red-400"}>
            {totalProfit.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between"><span>Margin</span><span>{margin.toFixed(1)}%</span></div>
      </div>

      <button
        onClick={runBatchProduction}
        disabled={!canProduce || loading}
        className={`mt-6 w-full py-3 rounded ${
          canProduce ? "bg-green-600" : "bg-red-600"
        }`}
      >
        {loading ? "Processing..." : canProduce ? "Produce" : "Fix Ingredients"}
      </button>
    </div>
  );
}