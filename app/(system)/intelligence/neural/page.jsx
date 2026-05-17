"use client";

import { useEffect, useState } from "react";

export default function NeuralForecastPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/neural",
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

      <div className="max-w-6xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold">
              Neural Forecast Engine
            </h1>

            <div className="text-zinc-500 mt-3">
              Predictive Revenue Intelligence Layer
            </div>

          </div>

          <button
            onClick={load}
            className="bg-white text-black px-8 py-4 rounded-2xl"
          >
            Refresh
          </button>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Average Revenue
            </div>

            <div className="text-4xl mt-4">
              {
                data?.baseline
                  ?.average_revenue || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Volatility
            </div>

            <div className="text-4xl mt-4">
              {
                data?.baseline
                  ?.volatility || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Trend
            </div>

            <div className="text-4xl mt-4">
              {
                data?.baseline
                  ?.trend || 0
              }
            </div>

          </div>

        </div>

        <div className="space-y-4">

          {data?.forecasts?.map(
            (
              item,
              index
            ) => (

              <div
                key={index}
                className="border border-zinc-800 rounded-2xl p-6 flex items-center justify-between"
              >

                <div>

                  <div className="text-2xl">
                    Day +{item.day_offset}
                  </div>

                  <div className="text-zinc-500 mt-2">
                    Confidence:
                    {" "}
                    {item.confidence}
                  </div>

                </div>

                <div className="text-3xl">
                  {
                    item.predicted_revenue
                  }
                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
