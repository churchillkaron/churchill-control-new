"use client";

import { useEffect, useState } from "react";

export default function ExecutiveDecisionPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/executive/decision",
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
    data?.executive_summary;

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="mb-10">

          <h1 className="text-6xl font-bold">
            Executive Decision Engine
          </h1>

          <div className="text-zinc-500 mt-3">
            Autonomous Executive Intelligence & Decision System
          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Investment Score
            </div>

            <div className="text-5xl mt-4 text-green-400">
              {
                summary?.investment_score || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Compliance Score
            </div>

            <div className="text-5xl mt-4">
              {
                summary?.compliance_score || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Anomalies
            </div>

            <div className="text-5xl mt-4 text-red-400">
              {
                summary?.anomaly_count || 0
              }
            </div>

          </div>

        </div>

        <div className="space-y-6">

          {data?.decisions?.map(
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
                    {item.confidence}
                  </div>

                </div>

                <div className="text-lg">
                  {item.decision}
                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
