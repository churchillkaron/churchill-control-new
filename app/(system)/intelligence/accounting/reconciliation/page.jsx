"use client";

import { useEffect, useState } from "react";

export default function ReconciliationPage() {

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
          "/api/intelligence/accounting/reconciliation",
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
              AI Reconciliation
            </h1>

            <div className="text-zinc-500 mt-3">
              Autonomous Accounting Matching Engine
            </div>

          </div>

          <button
            onClick={load}
            disabled={loading}
            className="bg-white text-black px-8 py-4 rounded-2xl disabled:opacity-50"
          >
            {loading
              ? "Reconciling..."
              : "Run Reconciliation"}
          </button>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Payments
            </div>

            <div className="text-5xl mt-4">
              {
                data?.summary
                  ?.total_payments || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Matched
            </div>

            <div className="text-5xl mt-4">
              {
                data?.summary
                  ?.matched || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Unmatched
            </div>

            <div className="text-5xl mt-4">
              {
                data?.summary
                  ?.unmatched || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Match Rate
            </div>

            <div className="text-5xl mt-4">
              {
                data?.summary
                  ?.reconciliation_rate || 0
              }%
            </div>

          </div>

        </div>

        <div className="space-y-6">

          {data?.reconciliation?.map(
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
                      {item.reference_no || "NO_REF"}
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {item.status}
                    </div>

                    {item.recommendation && (

                      <div className="mt-4 text-sm">
                        {item.recommendation}
                      </div>
                    )}

                  </div>

                  <div className="text-right">

                    <div>
                      Amount:
                      {" "}
                      {item.amount}
                    </div>

                    <div className="mt-2">
                      Confidence:
                      {" "}
                      {item.confidence}
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
