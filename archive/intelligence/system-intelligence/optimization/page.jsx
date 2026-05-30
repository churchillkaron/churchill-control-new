"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function OptimizationAIPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/optimization",
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
            Autonomous Optimization AI
          </h1>

          <div className="text-zinc-500 mt-2">
            Full Business Optimization Intelligence Engine
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Refresh
        </button>

      </div>

      <div className="border border-zinc-800 rounded-2xl p-6 mb-10">

        <div className="text-zinc-500">
          Active Optimizations
        </div>

        <div className="text-5xl mt-4">
          {data?.optimization_count || 0}
        </div>

      </div>

      <div className="space-y-6">

        {data?.optimizations?.map(
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
                  {item.type}
                </div>

                <div className="text-sm text-zinc-400">
                  {item.priority}
                </div>

              </div>

              <div className="text-lg">
                {item.recommendation}
              </div>

            </div>
          )
        )}

      </div>

    </div>
  );
}
