"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function InventoryForecastPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/inventory",
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

          <h1 className="text-6xl font-bold">
            Inventory Forecast AI
          </h1>

          <div className="text-zinc-500 mt-3">
            Predictive Stock Consumption & Restock Intelligence
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-8 py-4 rounded-2xl"
        >
          Refresh
        </button>

      </div>

      <div className="border border-zinc-800 rounded-2xl p-6 mb-10">

        <div className="text-zinc-500">
          Peak Revenue Forecast
        </div>

        <div className="text-5xl mt-4">
          {data?.peak_revenue || 0}
        </div>

      </div>

      <div className="space-y-6">

        {data?.forecast?.map(
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
                    {item.item}
                  </div>

                  <div className="text-zinc-500 mt-2">
                    Risk:
                    {" "}
                    {item.risk}
                  </div>

                </div>

                <div className="text-right">

                  <div>
                    Current:
                    {" "}
                    {item.current_quantity}
                    {" "}
                    {item.unit}
                  </div>

                  <div className="mt-2">
                    Usage:
                    {" "}
                    {item.projected_usage}
                  </div>

                  <div className="mt-2">
                    Remaining:
                    {" "}
                    {item.projected_remaining}
                  </div>

                  <div className="mt-2">
                    Minimum:
                    {" "}
                    {item.minimum_quantity}
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
