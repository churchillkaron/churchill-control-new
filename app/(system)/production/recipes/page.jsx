"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function RecipesPage() {

  const [
    dishes,
    setDishes,
  ] = useState([]);

  const [
    ingredients,
    setIngredients,
  ] = useState([]);

  const [
    recipes,
    setRecipes,
  ] = useState([]);

  const [
    form,
    setForm,
  ] = useState({

    dish_id: "",

    ingredient_id: "",

    quantity_required: 1,
  });

  async function loadData() {

    const [
      dishesRes,
      ingredientsRes,
      recipesRes,
    ] = await Promise.all([

      supabase
        .from("dishes")
        .select("*")
        .order(
          "name",
          {
            ascending: true,
          }
        ),

      supabase
        .from("ingredients")
        .select("*")
        .order(
          "name",
          {
            ascending: true,
          }
        ),

      fetch(
        "/api/production/recipes"
      ).then(
        (res) =>
          res.json()
      ),
    ]);

    setDishes(
      dishesRes.data || []
    );

    setIngredients(
      ingredientsRes.data || []
    );

    setRecipes(
      recipesRes.recipes || []
    );
  }

  async function createRecipe() {

    await fetch(
      "/api/production/recipes",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          tenant_id:
            "demo",

          ...form,
        }),
      }
    );

    setForm({

      dish_id: "",

      ingredient_id: "",

      quantity_required: 1,
    });

    loadData();
  }

  useEffect(() => {

    loadData();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Recipe Builder
        </h1>

        <div className="text-zinc-500 mb-10">
          Production Manufacturing Engine
        </div>

        <div className="border border-zinc-800 rounded-3xl p-8 mb-10">

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

            <select
              value={form.dish_id}
              onChange={(e) =>
                setForm({

                  ...form,

                  dish_id:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            >

              <option value="">
                Select Dish
              </option>

              {dishes.map(
                (
                  dish
                ) => (

                  <option
                    key={dish.id}
                    value={dish.id}
                  >
                    {dish.name}
                  </option>
                )
              )}

            </select>

            <select
              value={form.ingredient_id}
              onChange={(e) =>
                setForm({

                  ...form,

                  ingredient_id:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            >

              <option value="">
                Select Ingredient
              </option>

              {ingredients.map(
                (
                  ingredient
                ) => (

                  <option
                    key={
                      ingredient.id
                    }
                    value={
                      ingredient.id
                    }
                  >
                    {
                      ingredient.name
                    }
                  </option>
                )
              )}

            </select>

            <input
              type="number"
              placeholder="Quantity"
              value={
                form.quantity_required
              }
              onChange={(e) =>
                setForm({

                  ...form,

                  quantity_required:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            />

            <button
              onClick={
                createRecipe
              }
              className="bg-white text-black rounded-2xl font-bold"
            >
              ADD RECIPE ITEM
            </button>

          </div>

        </div>

        <div className="space-y-4">

          {recipes.map(
            (
              recipe
            ) => (

              <div
                key={recipe.id}
                className="border border-zinc-800 rounded-3xl p-6"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-2xl font-bold">
                      Dish:
                      {" "}
                      {
                        recipe.dish_id
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      Ingredient:
                      {" "}
                      {
                        recipe.ingredients
                          ?.name
                      }
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-xl">
                      {
                        recipe.quantity_required
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        recipe.ingredients
                          ?.unit
                      }
                    </div>

                  </div>

                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
