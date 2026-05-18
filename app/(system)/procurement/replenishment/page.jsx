"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function ReplenishmentPage() {

  const [
    ingredients,
    setIngredients,
  ] = useState([]);

  const [
    recommendations,
    setRecommendations,
  ] = useState({});

  async function loadIngredients() {

    const {
      data,
    } = await supabase
      .from("ingredients")
      .select("*")
      .order(
        "name",
        {
          ascending: true,
        }
      );

    setIngredients(
      data || []
    );
  }

  async function generateRecommendation(
    ingredient
  ) {

    const res =
      await fetch(
        "/api/procurement/replenishment",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            ingredient_id:
              ingredient.id,
          }),
        }
      );

    const json =
      await res.json();

    setRecommendations(
      (prev) => ({

        ...prev,

        [ingredient.id]:
          json,
      })
    );
  }

  useEffect(() => {

    loadIngredients();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Replenishment Intelligence
        </h1>

        <div className="text-zinc-500 mb-10">
          Procurement Forecasting Engine
        </div>

        <div className="space-y-4">

          {ingredients.map(
            (
              ingredient
            ) => {

              const recommendation =
                recommendations[
                  ingredient.id
                ];

              return (

                <div
                  key={ingredient.id}
                  className="border border-zinc-800 rounded-3xl p-6"
                >

                  <div className="flex items-center justify-between">

                    <div>

                      <div className="text-2xl font-bold">
                        {
                          ingredient.name
                        }
                      </div>

                      <div className="text-zinc-500 mt-2">
                        Stock:
                        {" "}
                        {
                          ingredient.quantity
                        }
                        {" "}
                        {
                          ingredient.unit
                        }
                      </div>

                    </div>

                    <button
                      onClick={() =>
                        generateRecommendation(
                          ingredient
                        )
                      }
                      className="bg-white text-black rounded-2xl px-6 py-3 font-bold"
                    >
                      ANALYZE
                    </button>

                  </div>

                  {recommendation?.success && (

                    <div className="grid grid-cols-3 gap-4 mt-8">

                      <div className="border border-zinc-800 rounded-2xl p-4">

                        <div className="text-zinc-500 text-sm">
                          Daily Consumption
                        </div>

                        <div className="text-2xl mt-2">
                          {
                            recommendation.avg_daily_consumption
                          }
                        </div>

                      </div>

                      <div className="border border-zinc-800 rounded-2xl p-4">

                        <div className="text-zinc-500 text-sm">
                          Current Stock
                        </div>

                        <div className="text-2xl mt-2">
                          {
                            recommendation.current_stock
                          }
                        </div>

                      </div>

                      <div className="border border-zinc-800 rounded-2xl p-4">

                        <div className="text-zinc-500 text-sm">
                          Recommended Buy
                        </div>

                        <div className="text-2xl mt-2 text-green-400">
                          {
                            recommendation.recommended_purchase
                          }
                        </div>

                      </div>

                    </div>
                  )}

                </div>
              );
            }
          )}

        </div>

      </div>

    </div>
  );
}
