"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function DemandAIPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/demand",
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
            Demand Prediction AI
          </h1>

          <div className="text-zinc-500 mt-2">
            AI Sales & Demand Forecasting Intelligence
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Refresh
        </button>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-2xl mb-4">
            Peak Demand Day
          </div>

          <div className="text-4xl">
            {data?.peak_day?.day}
          </div>

          <div className="mt-4 text-zinc-400">
            Revenue:
            {" "}
            {data?.peak_day?.revenue}
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-2xl mb-4">
            Lowest Demand Day
          </div>

          <div className="text-4xl">
            {data?.lowest_day?.day}
          </div>

          <div className="mt-4 text-zinc-400">
            Revenue:
            {" "}
            {data?.lowest_day?.revenue}
          </div>

        </div>

      </div>

      <div className="space-y-6">

        {data?.demand?.map(
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
                    {item.day}
                  </div>

                  <div className="text-zinc-500 mt-2">
                    Orders:
                    {" "}
                    {item.orders}
                  </div>

                </div>

                <div className="text-right">

                  <div>
                    Revenue:
                    {" "}
                    {item.revenue}
                  </div>

                  <div className="mt-2">
                    Avg Order:
                    {" "}
                    {
                      item.average_order_value
                    }
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
