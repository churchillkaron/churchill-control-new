"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function RecipesPage() {

  const [dishes, setDishes] = useState([]);
  const [ingredients, setIngredients] = useState([]);

  const [selectedDish, setSelectedDish] =
    useState("");

  const [recipeItems, setRecipeItems] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {

    setLoading(true);

    const { data: dishData } =
      await supabase
        .from("dishes")
        .select("*")
        .order("name");

    const { data: ingredientData } =
      await supabase
        .from("ingredients")
        .select("*")
        .order("name");

    setDishes(dishData || []);
    setIngredients(
      ingredientData || []
    );

    setLoading(false);

  }

  async function loadRecipe(
    dishId
  ) {

    setSelectedDish(dishId);

    const response =
      await fetch(
        "/api/production/recipes/get",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            dish_id: dishId,
          }),

        }
      );

    const data =
      await response.json();

    setRecipeItems(data || []);

  }

  function addRecipeRow() {

    setRecipeItems([
      ...recipeItems,
      {
        ingredient_id: "",
        quantity: 0,
      },
    ]);

  }

  function updateRecipeRow(
    index,
    field,
    value
  ) {

    const updated =
      [...recipeItems];

    updated[index][field] =
      value;

    setRecipeItems(updated);

  }

  async function saveRecipe() {

    if (!selectedDish) {

      alert(
        "Select dish first"
      );

      return;

    }

    const response =
      await fetch(
        "/api/production/recipes/create",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            dishId:
              selectedDish,

            ingredients:
              recipeItems,

          }),

        }
      );

    const result =
      await response.json();

    if (!response.ok) {

      alert(
        result.error ||
        "Failed to save recipe"
      );

      return;

    }

    alert(
      "Recipe saved"
    );

  }

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading recipes...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Recipe Management
        </h1>

        <div className="text-white/50 mt-2">
          Production and cost control engine
        </div>

      </div>

      {/* DISH */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">

        <h2 className="text-2xl mb-6">
          Select Dish
        </h2>

        <select
          value={selectedDish}
          onChange={(e) =>
            loadRecipe(
              e.target.value
            )
          }
          className="bg-black border border-white/10 rounded-xl px-4 py-3 w-full"
        >

          <option value="">
            Select Dish
          </option>

          {dishes.map((dish) => (

            <option
              key={dish.id}
              value={dish.id}
            >

              {dish.name}

            </option>

          ))}

        </select>

      </div>

      {/* RECIPE */}
      {selectedDish && (

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">

          <div className="flex justify-between items-center mb-6">

            <h2 className="text-2xl">
              Recipe Items
            </h2>

            <button
              onClick={addRecipeRow}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl"
            >

              Add Ingredient

            </button>

          </div>

          <div className="space-y-4">

            {recipeItems.map(
              (item, index) => (

                <div
                  key={index}
                  className="grid grid-cols-2 gap-4"
                >

                  <select
                    value={
                      item.ingredient_id
                    }
                    onChange={(e) =>
                      updateRecipeRow(
                        index,
                        "ingredient_id",
                        e.target.value
                      )
                    }
                    className="bg-black border border-white/10 rounded-xl px-4 py-3"
                  >

                    <option value="">
                      Ingredient
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
                      item.quantity
                    }
                    onChange={(e) =>
                      updateRecipeRow(
                        index,
                        "quantity",
                        e.target.value
                      )
                    }
                    className="bg-black border border-white/10 rounded-xl px-4 py-3"
                  />

                </div>

              )
            )}

          </div>

          <button
            onClick={saveRecipe}
            className="mt-8 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl"
          >

            Save Recipe

          </button>

        </div>

      )}

    </div>

  );

}