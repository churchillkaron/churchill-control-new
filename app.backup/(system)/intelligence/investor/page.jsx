"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function InvestorPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/investor",
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

  const snapshot =
    data?.investor_snapshot;

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold">
              Investor Intelligence
            </h1>

            <div className="text-zinc-500 mt-3">
              Enterprise Valuation & Investment Intelligence Engine
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
              Estimated Valuation
            </div>

            <div className="text-5xl mt-4">
              {
                snapshot
                  ?.estimated_valuation || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Investment Score
            </div>

            <div className="text-5xl mt-4">
              {
                snapshot
                  ?.investment_score || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Franchise Locations
            </div>

            <div className="text-5xl mt-4">
              {
                snapshot
                  ?.franchise_locations || 0
              }
            </div>

          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-2xl mb-6">
            Revenue Forecast
          </div>

          <div className="space-y-4">

            {data?.forecasting?.map(
              (
                item,
                index
              ) => (

                <div
                  key={index}
                  className="border border-zinc-800 rounded-xl p-4 flex items-center justify-between"
                >

                  <div>
                    Forecast Day +{item.day_offset}
                  </div>

                  <div className="text-right">

                    <div>
                      {
                        item.predicted_revenue
                      }
                    </div>

                    <div className="text-zinc-500 text-sm mt-2">
                      {
                        item.confidence
                      }
                    </div>

                  </div>

                </div>
              )
            )}

          </div>

        </div>

      </div>

    </div>
  );
}
