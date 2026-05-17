"use client";

import { useEffect, useState } from "react";

export default function WasteAIPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/waste",
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
            Food Waste AI
          </h1>

          <div className="text-zinc-500 mt-3">
            Waste Reduction & Operational Efficiency Intelligence
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-8 py-4 rounded-2xl"
        >
          Refresh
        </button>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Total Waste Cost
          </div>

          <div className="text-5xl mt-4">
            {data?.total_waste_cost || 0}
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Critical Waste Items
          </div>

          <div className="text-5xl mt-4">
            {data?.critical_items || 0}
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

              <div className="flex items-start justify-between">

                <div>

                  <div className="text-2xl">
                    {item.item}
                  </div>

                  <div className="text-zinc-500 mt-2">
                    Incidents:
                    {" "}
                    {item.incidents}
                  </div>

                  <div className="mt-4 text-sm">
                    {item.recommendation}
                  </div>

                </div>

                <div className="text-right">

                  <div>
                    Cost:
                    {" "}
                    {item.total_cost}
                  </div>

                  <div className="mt-2">
                    Quantity:
                    {" "}
                    {item.total_quantity}
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
