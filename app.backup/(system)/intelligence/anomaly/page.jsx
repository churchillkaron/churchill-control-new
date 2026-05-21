"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function AnomalyPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/anomaly",
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
              Predictive Anomaly Engine
            </h1>

            <div className="text-zinc-500 mt-3">
              AI Risk Detection & Preventive Intelligence
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
            Active Anomalies
          </div>

          <div className="text-5xl mt-4">
            {data?.anomaly_count || 0}
          </div>

        </div>

        <div className="space-y-6">

          {data?.anomalies?.map(
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

                  <div className="text-sm text-red-400">
                    {item.severity}
                  </div>

                </div>

                <div className="mb-4 text-lg">
                  {item.prediction}
                </div>

                <div className="text-zinc-400">
                  {item.recommendation}
                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
