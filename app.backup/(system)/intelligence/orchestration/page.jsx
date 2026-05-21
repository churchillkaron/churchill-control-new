"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function OrchestrationPage() {

  const [
    data,
    setData,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function runOrchestrator() {

    setLoading(true);

    try {

      const res =
        await fetch(
          "/api/intelligence/orchestration",
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

    runOrchestrator();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-6xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold">
              Autonomous Orchestrator
            </h1>

            <div className="text-zinc-500 mt-3">
              Self-Optimizing Restaurant Intelligence Engine
            </div>

          </div>

          <button
            onClick={
              runOrchestrator
            }
            disabled={loading}
            className="bg-white text-black px-8 py-4 rounded-2xl disabled:opacity-50"
          >
            {loading
              ? "Running..."
              : "Run Orchestrator"}
          </button>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6 mb-10">

          <div className="text-zinc-500">
            Autonomous Actions
          </div>

          <div className="text-5xl mt-4">
            {data?.total_actions || 0}
          </div>

        </div>

        <div className="space-y-6">

          {data?.autonomous_actions?.map(
            (
              action,
              index
            ) => (

              <div
                key={index}
                className="border border-zinc-800 rounded-2xl p-6"
              >

                <div className="flex items-center justify-between mb-4">

                  <div className="text-2xl">
                    {action.type}
                  </div>

                  <div className="text-sm text-zinc-400">
                    {action.priority}
                  </div>

                </div>

                <div className="text-lg">
                  {action.message}
                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
