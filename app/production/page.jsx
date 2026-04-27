"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ProductionPage() {
  const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  const [lowDishes, setLowDishes] = useState([]);
  const [loadingId, setLoadingId] = useState(null);

  // 🔹 LOAD LOW DISHES
  const loadLowDishes = async () => {
    const { data: dishStock } = await supabase
      .from("dish_stock")
      .select("dish_id, quantity")
      .eq("tenant_id", tenant_id);

    const { data: dishes } = await supabase
      .from("dishes")
      .select("id, name")
      .eq("tenant_id", tenant_id);

    const map = {};
    for (const d of dishes || []) {
      map[d.id] = d.name;
    }

    const low = (dishStock || [])
      .filter((d) => Number(d.quantity) <= 5)
      .map((d) => {
        const qty = Number(d.quantity || 0);

        // 🔥 SMART PRODUCTION LOGIC
        const suggested = Math.max(10 - qty, 5);

        return {
          dish_id: d.dish_id,
          name: map[d.dish_id] || d.dish_id,
          quantity: qty,
          suggested,
        };
      });

    setLowDishes(low);
  };

  useEffect(() => {
    loadLowDishes();
  }, []);

  // 🔹 PRODUCE ACTION
  const produce = async (dish_id, qty) => {
    setLoadingId(dish_id);

    try {
      const res = await fetch("/api/production", {
        method: "POST",
        body: JSON.stringify({
          dish_id,
          quantity: qty,
        }),
      });

      const result = await res.json();

      if (!result.success) {
        alert(result.error || "Production failed");
      }

      await loadLowDishes();
    } catch (err) {
      console.error(err);
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
            className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg"
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