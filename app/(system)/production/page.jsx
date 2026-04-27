"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";
import { supabase } from "@/lib/supabase";

export default function ProductionPage() {
  const [dishes, setDishes] = useState([]);
  const tenantId = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  const loadDishes = async () => {
    const { data } = await supabase.from("recipes").select("*");
    setDishes(data || []);
  };

  useEffect(() => {
    loadDishes();
  }, []);

  const produceDish = async (dish_id, qty) => {
    const { data: recipe } = await supabase
      .from("recipes")
      .select("*")
      .eq("dish_id", dish_id)
      .single();

    if (!recipe) return;

    const { data: recipeItems } = await supabase
      .from("recipe_items")
      .select("*")
      .eq("recipe_id", recipe.id);

    // 🔻 deduct ingredients
    for (const ri of recipeItems || []) {
      await supabase.rpc("decrement_inventory", {
        ingredient_id_input: ri.ingredient_id,
        qty: ri.quantity * qty,
      });
    }

    // 🔺 increase dish_stock
    const { data: stock } = await supabase
      .from("dish_stock")
      .select("*")
      .eq("dish_id", dish_id)
      .single();

    if (stock) {
      await supabase
        .from("dish_stock")
        .update({
          quantity: stock.quantity + qty,
        })
        .eq("dish_id", dish_id);
    } else {
      await supabase.from("dish_stock").insert({
        dish_id,
        quantity: qty,
        tenant_id: tenantId,
      });
    }

    // log
    await supabase.from("production_logs").insert({
      dish_id,
      quantity: qty,
      tenant_id: tenantId,
    });

    alert("Produced ✔");
  };

  return (
    <AppShell>
      <div className="p-6 text-white space-y-6">
        <h1 className="text-3xl">Production</h1>

        <div className="grid md:grid-cols-3 gap-4">
          {dishes.map((dish) => (
            <div
              key={dish.id}
              className="bg-white/5 p-4 rounded-xl border border-white/10"
            >
              <div className="mb-2">{dish.name || dish.dish_id}</div>

              <div className="flex gap-2">
                <button
                  onClick={() => produceDish(dish.dish_id, 5)}
                  className="bg-green-500 px-3 py-1 rounded"
                >
                  +5
                </button>

                <button
                  onClick={() => produceDish(dish.dish_id, 10)}
                  className="bg-blue-500 px-3 py-1 rounded"
                >
                  +10
                </button>

                <button
                  onClick={() => produceDish(dish.dish_id, 20)}
                  className="bg-orange-500 px-3 py-1 rounded"
                >
                  +20
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}