"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function AutonomousProcurementPage() {

  const [
    data,
    setData,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function runEngine() {

    setLoading(true);

    try {

      const res =
        await fetch(
          "/api/intelligence/procurement/automation",
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

    } finally {

      setLoading(false);
    }
  }

  useEffect(() => {

    runEngine();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold">
              Autonomous Procurement
            </h1>

            <div className="text-zinc-500 mt-3">
              AI Purchasing & Inventory Replenishment Engine
            </div>

          </div>

          <button
            onClick={runEngine}
            disabled={loading}
            className="bg-white text-black px-8 py-4 rounded-2xl disabled:opacity-50"
          >
            {loading
              ? "Running..."
              : "Run Procurement AI"}
          </button>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6 mb-10">

          <div className="text-zinc-500">
            Generated Purchase Orders
          </div>

          <div className="text-5xl mt-4">
            {
              data?.generated_orders || 0
            }
          </div>

        </div>

        <div className="space-y-6">

          {data?.recommendations?.map(
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
                      Risk:
                      {" "}
                      {item.risk}
                    </div>

                    <div className="mt-4">
                      Suggested Order:
                      {" "}
                      {
                        item.suggested_order_quantity
                      }
                      {" "}
                      {item.unit}
                    </div>

                  </div>

                  <div className="text-right">

                    <div>
                      Current:
                      {" "}
                      {item.current_quantity}
                    </div>

                    <div className="mt-2">
                      Remaining:
                      {" "}
                      {
                        item.projected_remaining
                      }
                    </div>

                    <div className="mt-2 text-red-400">
                      {item.priority}
                    </div>

                  </div>

                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
