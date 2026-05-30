"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function StrategyPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/strategy",
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

  const summary =
    data?.strategic_summary;

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="mb-10">

          <h1 className="text-6xl font-bold">
            AI Strategic Planning
          </h1>

          <div className="text-zinc-500 mt-3">
            Enterprise Strategic Intelligence & Planning Engine
          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-10">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Revenue
            </div>

            <div className="text-4xl mt-4">
              {summary?.revenue || 0}
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Customers
            </div>

            <div className="text-4xl mt-4">
              {summary?.customers || 0}
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Valuation
            </div>

            <div className="text-4xl mt-4">
              {summary?.valuation || 0}
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Growth
            </div>

            <div className="text-4xl mt-4 text-green-400">
              {summary?.growth_trend || 0}
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Anomalies
            </div>

            <div className="text-4xl mt-4 text-red-400">
              {summary?.anomalies || 0}
            </div>

          </div>

        </div>

        <div className="space-y-6">

          {data?.strategies?.map(
            (
              item,
              index
            ) => (

              <div
                key={index}
                className="border border-zinc-800 rounded-2xl p-6"
              >

                <div className="flex items-center justify-between mb-4">

                  <div className="text-2xl">
                    {item.category}
                  </div>

                  <div className="text-sm text-zinc-400">
                    {item.priority}
                  </div>

                </div>

                <div className="text-lg mb-6">
                  {item.objective}
                </div>

                <div className="space-y-3">

                  {item.initiatives?.map(
                    (
                      initiative,
                      idx
                    ) => (

                      <div
                        key={idx}
                        className="border border-zinc-800 rounded-xl p-4"
                      >
                        {initiative}
                      </div>
                    )
                  )}

                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
