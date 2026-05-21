"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function NegotiationPage() {

  const [
    data,
    setData,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function load() {

    setLoading(true);

    try {

      const res =
        await fetch(
          "/api/intelligence/negotiation",
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

    load();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold">
              AI Negotiation Agent
            </h1>

            <div className="text-zinc-500 mt-3">
              Autonomous Supplier Negotiation Intelligence
            </div>

          </div>

          <button
            onClick={load}
            disabled={loading}
            className="bg-white text-black px-8 py-4 rounded-2xl disabled:opacity-50"
          >
            {loading
              ? "Analyzing..."
              : "Run Negotiation AI"}
          </button>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Negotiations
            </div>

            <div className="text-5xl mt-4">
              {
                data?.total_negotiations || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Projected Savings
            </div>

            <div className="text-5xl mt-4">
              {
                data?.projected_total_savings || 0
              }
            </div>

          </div>

        </div>

        <div className="space-y-6">

          {data?.negotiations?.map(
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
                      {item.supplier}
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {item.item}
                    </div>

                    <div className="mt-4">
                      {item.strategy}
                    </div>

                  </div>

                  <div className="text-right">

                    <div>
                      Amount:
                      {" "}
                      {item.amount}
                    </div>

                    <div className="mt-2">
                      Discount:
                      {" "}
                      {item.target_discount}%
                    </div>

                    <div className="mt-2">
                      Savings:
                      {" "}
                      {
                        item.projected_savings
                      }
                    </div>

                    <div className="mt-2 text-green-400">
                      {item.leverage}
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
