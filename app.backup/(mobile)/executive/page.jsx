"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function ExecutiveMobilePage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/mobile/executive",
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

  const dashboard =
    data?.mobile_dashboard;

  return (

    <div className="min-h-screen bg-black text-white p-6">

      <div className="max-w-md mx-auto">

        <div className="mb-10">

          <h1 className="text-5xl font-bold">
            Churchill Mobile
          </h1>

          <div className="text-zinc-500 mt-3">
            Executive Intelligence App
          </div>

        </div>

        <div className="space-y-6">

          <div className="border border-zinc-800 rounded-3xl p-6">

            <div className="text-zinc-500">
              Revenue
            </div>

            <div className="text-5xl mt-4">
              {
                dashboard?.revenue || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-3xl p-6">

            <div className="text-zinc-500">
              Customers
            </div>

            <div className="text-5xl mt-4">
              {
                dashboard?.customers || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-3xl p-6">

            <div className="text-zinc-500">
              Active Anomalies
            </div>

            <div className="text-5xl mt-4 text-red-400">
              {
                dashboard?.active_anomalies || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-3xl p-6">

            <div className="text-zinc-500">
              Investment Score
            </div>

            <div className="text-5xl mt-4 text-green-400">
              {
                dashboard?.investment_score || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-3xl p-6">

            <div className="text-zinc-500">
              Valuation
            </div>

            <div className="text-5xl mt-4">
              {
                dashboard?.valuation || 0
              }
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
