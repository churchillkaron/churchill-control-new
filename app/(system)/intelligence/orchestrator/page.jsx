"use client";

import { useState } from "react";

export default function IntelligenceOrchestratorPage() {

  const [
    report,
    setReport,
  ] = useState(null);

  async function runCycle() {

    const res =
      await fetch(
        "/api/intelligence/orchestrator/run",
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

    setReport(
      json.report
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-5xl font-bold mb-10">
        Intelligence Orchestrator
      </h1>

      <button
        onClick={runCycle}
        className="bg-white text-black px-6 py-3 rounded-xl"
      >
        Run Full Intelligence Cycle
      </button>

      {report && (

        <div className="mt-10 space-y-6">

          <div className="border border-zinc-800 rounded-xl p-6">
            <div className="text-zinc-400 mb-2">
              Revenue
            </div>

            <div className="text-3xl">
              {
                report.executive
                  ?.revenue
                  ?.total_revenue
              }
            </div>
          </div>

          <div className="border border-zinc-800 rounded-xl p-6">
            <div className="text-zinc-400 mb-2">
              Performance
            </div>

            <div className="text-3xl">
              {
                report.performance
                  ?.performance
              }
            </div>
          </div>

          <div className="border border-zinc-800 rounded-xl p-6">
            <div className="text-zinc-400 mb-2">
              Forecast
            </div>

            <div className="text-3xl">
              {
                report.forecast
                  ?.projected_30_day_revenue
              }
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
