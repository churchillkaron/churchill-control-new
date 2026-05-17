"use client";

import { useEffect, useState } from "react";

export default function SimulationPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/simulation",
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
            Digital Twin Simulation
          </h1>

          <div className="text-zinc-500 mt-3">
            Autonomous Restaurant Scenario Modeling Engine
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-8 py-4 rounded-2xl"
        >
          Run Simulation
        </button>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Revenue
          </div>

          <div className="text-4xl mt-4">
            {data?.baseline?.revenue || 0}
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Avg Margin
          </div>

          <div className="text-4xl mt-4">
            {data?.baseline?.average_margin || 0}%
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Staffing
          </div>

          <div className="text-4xl mt-4">
            {data?.baseline?.staffing_level}
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Peak Day
          </div>

          <div className="text-4xl mt-4">
            {data?.baseline?.peak_day}
          </div>

        </div>

      </div>

      <div className="space-y-6">

        {data?.simulations?.map(
          (
            item,
            index
          ) => (

            <div
              key={index}
              className="border border-zinc-800 rounded-2xl p-6"
            >

              <div className="text-2xl mb-4">
                {item.scenario}
              </div>

              <pre className="overflow-auto text-sm">
                {JSON.stringify(
                  item,
                  null,
                  2
                )}
              </pre>

            </div>
          )
        )}

      </div>

    </div>
  );
}
