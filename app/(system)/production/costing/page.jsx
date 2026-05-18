"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function ProductionCostingPage() {

  const [
    dishes,
    setDishes,
  ] = useState([]);

  const [
    results,
    setResults,
  ] = useState({});

  async function loadDishes() {

    const {
      data,
    } = await supabase
      .from("dishes")
      .select("*")
      .order(
        "name",
        {
          ascending: true,
        }
      );

    setDishes(
      data || []
    );
  }

  async function calculateCost(
    dish_id
  ) {

    const res =
      await fetch(
        "/api/production/costing",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            dish_id,
          }),
        }
      );

    const json =
      await res.json();

    setResults(
      (prev) => ({

        ...prev,

        [dish_id]:
          json,
      })
    );

    loadDishes();
  }

  useEffect(() => {

    loadDishes();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Production Costing
        </h1>

        <div className="text-zinc-500 mb-10">
          Manufacturing Cost Intelligence
        </div>

        <div className="space-y-4">

          {dishes.map(
            (
              dish
            ) => {

              const result =
                results[
                  dish.id
                ];

              return (

                <div
                  key={dish.id}
                  className="border border-zinc-800 rounded-3xl p-6"
                >

                  <div className="flex items-center justify-between">

                    <div>

                      <div className="text-2xl font-bold">
                        {dish.name}
                      </div>

                      <div className="text-zinc-500 mt-2">
                        {dish.category}
                      </div>

                    </div>

                    <button
                      onClick={() =>
                        calculateCost(
                          dish.id
                        )
                      }
                      className="bg-white text-black rounded-2xl px-6 py-3 font-bold"
                    >
                      CALCULATE
                    </button>

                  </div>

                  <div className="grid grid-cols-4 gap-4 mt-8">

                    <div className="border border-zinc-800 rounded-2xl p-4">

                      <div className="text-zinc-500 text-sm">
                        Price
                      </div>

                      <div className="text-2xl mt-2">
                        ฿
                        {dish.price || 0}
                      </div>

                    </div>

                    <div className="border border-zinc-800 rounded-2xl p-4">

                      <div className="text-zinc-500 text-sm">
                        Cost
                      </div>

                      <div className="text-2xl mt-2">
                        ฿
                        {dish.cost || 0}
                      </div>

                    </div>

                    <div className="border border-zinc-800 rounded-2xl p-4">

                      <div className="text-zinc-500 text-sm">
                        Profit
                      </div>

                      <div className="text-2xl mt-2">
                        ฿
                        {result?.profit || 0}
                      </div>

                    </div>

                    <div className="border border-zinc-800 rounded-2xl p-4">

                      <div className="text-zinc-500 text-sm">
                        Food Cost %
                      </div>

                      <div className="text-2xl mt-2">
                        {result?.food_cost_percent || 0}
                        %
                      </div>

                    </div>

                  </div>

                </div>
              );
            }
          )}

        </div>

      </div>

    </div>
  );
}
