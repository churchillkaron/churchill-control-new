"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function ProductionPage() {
  const [lowDishes, setLowDishes] = useState([]);
  const [loadingId, setLoadingId] = useState(null);

  // 🔹 LOAD LOW DISHES (SAFE)
  const loadLowDishes = async () => {
    try {
      const { data: dishStock, error: stockError } = await supabase
        .from("dish_stock")
        .select("dish_id, quantity")
        .eq("tenant_id", TENANT_ID);

      if (stockError) {
        console.error("STOCK LOAD ERROR:", stockError);
        return;
      }

      const { data: dishes, error: dishError } = await supabase
        .from("dishes")
        .select("id, name")
        .eq("tenant_id", TENANT_ID);

      if (dishError) {
        console.error("DISH LOAD ERROR:", dishError);
        return;
      }

      const dishMap = {};
      for (const d of dishes || []) {
        dishMap[d.id] = d.name;
      }

      const low = (dishStock || [])
        .filter((d) => Number(d.quantity) <= 5)
        .map((d) => {
          const qty = Number(d.quantity || 0);

          const suggested = Math.max(10 - qty, 5);

          return {
            dish_id: d.dish_id,
            name: dishMap[d.dish_id] || d.dish_id,
            quantity: qty,
            suggested,
          };
        });

      setLowDishes(low);
    } catch (err) {
      console.error("LOAD ERROR:", err);
    }
  };

  useEffect(() => {
    loadLowDishes();

    // 🔥 REAL-TIME SYNC (IMPORTANT FOR MULTI-USER)
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

  // 🔹 PRODUCE ACTION (SAFE)
const produce = async (dish_id, qty) => {
  if (loadingId) return;

  setLoadingId(dish_id);

  try {
    const res = await fetch("/api/production/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        dish_id,
        quantity: Number(qty),
        source_id: `manual-${dish_id}-${Date.now()}`,
      }),
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      alert(result.error || "Production failed");
    }

    await loadLowDishes();
  } catch (err) {
    console.error("PRODUCTION ERROR:", err);
    alert("Production error");
  }

  setLoadingId(null);
};
  

  return (
    <div className="p-6 text-white max-w-3xl mx-auto">
      <h1 className="text-2xl mb-6 font-semibold">Production</h1>

      {lowDishes.length === 0 && (
        <div className="text-white/50">No production needed</div>
      )}

      {lowDishes.map((dish) => (
        <div
          key={dish.dish_id}
          className="bg-white/5 border border-white/10 p-4 rounded-xl mb-3 flex justify-between items-center"
        >
          <div>
            <div className="font-semibold">{dish.name}</div>

            <div className="text-sm text-yellow-400">
              Stock: {dish.quantity}
            </div>

            <div className="text-sm text-green-400">
              Suggested: {dish.suggested}
            </div>
          </div>

          <button
            onClick={() => produce(dish.dish_id, dish.suggested)}
            disabled={loadingId === dish.dish_id}
            className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg disabled:bg-white/30"
          >
            {loadingId === dish.dish_id
              ? "Producing..."
              : `Produce ${dish.suggested}`}
          </button>
        </div>
      ))}
    </div>
  );
}