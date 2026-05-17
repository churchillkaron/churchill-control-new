"use client";

import { useEffect, useState } from "react";

export default function ProductionAIPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/production",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            tenant_id:
              "demo",
          }),
        }
      );

    const json =
      await res.json();

    setData(json);
  }

  useEffect(() => {

    load();

  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-5xl font-bold">
            Production Costing AI
          </h1>

          <div className="text-zinc-500 mt-2">
            Recipe Margin & Cost Intelligence
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Refresh
        </button>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Total Items
          </div>

          <div className="text-4xl mt-4">
            {
              data?.summary
                ?.total_items || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Total Cost
          </div>

          <div className="text-4xl mt-4">
            {
              data?.summary
                ?.total_cost || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Revenue
          </div>

          <div className="text-4xl mt-4">
            {
              data?.summary
                ?.total_revenue || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Avg Margin
          </div>

          <div className="text-4xl mt-4">
            {
              data?.summary
                ?.average_margin || 0
            }%
          </div>

        </div>

      </div>

      <div className="space-y-6">

        {data?.analysis?.map(
          (
            item,
            index
          ) => (

            <div
              key={index}
              className="border border-zinc-800 rounded-2xl p-6"
            >

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-2xl">
                    {item.recipe}
                  </div>

                  <div className="text-zinc-500 mt-2">
                    {item.category}
                  </div>

                </div>

                <div className="text-right">

                  <div>
                    Cost:
                    {" "}
                    {item.cost}
                  </div>

                  <div className="mt-2">
                    Selling:
                    {" "}
                    {item.selling_price}
                  </div>

                  <div className="mt-2">
                    Margin:
                    {" "}
                    {item.margin}%
                  </div>

                  <div className="mt-2">
                    {item.health}
                  </div>

                </div>

              </div>

            </div>
          )
        )}

      </div>

    </div>
  );
}
