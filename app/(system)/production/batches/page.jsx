"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function ProductionBatchPage() {

  const [
    ingredients,
    setIngredients,
  ] = useState([]);

  const [
    batches,
    setBatches,
  ] = useState([]);

  const [
    form,
    setForm,
  ] = useState({

    batch_name: "",

    output_quantity: 1,

    output_unit: "kg",
  });

  async function loadData() {

    const [
      ingredientsRes,
      batchesRes,
    ] = await Promise.all([

      supabase
        .from("ingredients")
        .select("*")
        .order(
          "name",
          {
            ascending: true,
          }
        ),

      supabase
        .from(
          "production_batches"
        )
        .select("*")
        .order(
          "created_at",
          {
            ascending: false,
          }
        ),
    ]);

    setIngredients(
      ingredientsRes.data || []
    );

    setBatches(
      batchesRes.data || []
    );
  }

  async function createBatch() {

    const payload = {

      tenant_id:
        "demo",

      batch_name:
        form.batch_name,

      output_quantity:
        Number(
          form.output_quantity
        ),

      output_unit:
        form.output_unit,

      ingredients:
        ingredients
          .slice(0, 2)
          .map(
            (
              ingredient
            ) => ({

              ingredient_id:
                ingredient.id,

              quantity: 1,
            })
          ),
    };

    await fetch(
      "/api/production/batches",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify(
          payload
        ),
      }
    );

    loadData();
  }

  useEffect(() => {

    loadData();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Batch Production
        </h1>

        <div className="text-zinc-500 mb-10">
          Manufacturing & Prep Engine
        </div>

        <div className="border border-zinc-800 rounded-3xl p-8 mb-10">

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

            <input
              placeholder="Batch Name"
              value={
                form.batch_name
              }
              onChange={(e) =>
                setForm({

                  ...form,

                  batch_name:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            />

            <input
              type="number"
              placeholder="Output Quantity"
              value={
                form.output_quantity
              }
              onChange={(e) =>
                setForm({

                  ...form,

                  output_quantity:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            />

            <input
              placeholder="Unit"
              value={
                form.output_unit
              }
              onChange={(e) =>
                setForm({

                  ...form,

                  output_unit:
                    e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4"
            />

            <button
              onClick={
                createBatch
              }
              className="bg-white text-black rounded-2xl font-bold"
            >
              CREATE BATCH
            </button>

          </div>

        </div>

        <div className="space-y-4">

          {batches.map(
            (
              batch
            ) => (

              <div
                key={batch.id}
                className="border border-zinc-800 rounded-3xl p-6"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-2xl font-bold">
                      {
                        batch.batch_name
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        batch.status
                      }
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-2xl">
                      {
                        batch.output_quantity
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        batch.output_unit
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
