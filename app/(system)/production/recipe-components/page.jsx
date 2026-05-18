"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function RecipeComponentsPage() {

  const [
    dishes,
    setDishes,
  ] = useState([]);

  const [
    preparedInventory,
    setPreparedInventory,
  ] = useState([]);

  const [
    components,
    setComponents,
  ] = useState([]);

  const [
    form,
    setForm,
  ] = useState({

    dish_id: "",

    prepared_item_name: "",

    quantity_required: 1,

    unit: "portion",
  });

  async function loadData() {

    const [
      dishesRes,
      preparedRes,
      componentsRes,
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
        .from(
          "prepared_inventory"
        )
        .select("*")
        .order(
          "item_name",
          {
            ascending: true,
          }
        ),

      fetch(
        "/api/production/recipe-components"
      ).then(
        (res) =>
          res.json()
      ),
    ]);

    setDishes(
      dishesRes.data || []
    );

    setPreparedInventory(
      preparedRes.data || []
    );

    setComponents(
      componentsRes.components || []
    );
  }

  async function createComponent() {

    await fetch(
      "/api/production/recipe-components",
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

      prepared_item_name: "",

      quantity_required: 1,

      unit: "portion",
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
          Recipe Components
        </h1>

        <div className="text-zinc-500 mb-10">
          Prepared Inventory Recipe Engine
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
              value={
                form.prepared_item_name
              }
              onChange={(e) =>
                setForm({

                  ...form,

                  prepared_item_name:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            >

              <option value="">
                Select Prepared Item
              </option>

              {preparedInventory.map(
                (
                  item
                ) => (

                  <option
                    key={item.id}
                    value={
                      item.item_name
                    }
                  >
                    {
                      item.item_name
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
                createComponent
              }
              className="bg-white text-black rounded-2xl font-bold"
            >
              ADD COMPONENT
            </button>

          </div>

        </div>

        <div className="space-y-4">

          {components.map(
            (
              component
            ) => (

              <div
                key={component.id}
                className="border border-zinc-800 rounded-3xl p-6"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-2xl font-bold">
                      Dish:
                      {" "}
                      {
                        component.dish_id
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      Prepared:
                      {" "}
                      {
                        component.prepared_item_name
                      }
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-2xl">
                      {
                        component.quantity_required
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        component.unit
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
