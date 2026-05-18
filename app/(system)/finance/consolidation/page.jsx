"use client";

import { useState } from "react";

export default function ConsolidationPage() {

  const [
    report,
    setReport,
  ] = useState(null);

  async function generateConsolidation() {

    const res =
      await fetch(
        "/api/finance/consolidation",
        {
          method: "PATCH",
        }
      );

    const json =
      await res.json();

    setReport(
      json
    );
  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold mb-3">
              Consolidation
            </h1>

            <div className="text-zinc-500">
              Enterprise Group Accounting
            </div>

          </div>

          <button
            onClick={
              generateConsolidation
            }
            className="bg-white text-black rounded-2xl px-8 py-4 font-bold"
          >
            GENERATE
          </button>

        </div>

        {report && (

          <div className="space-y-6">

            <div className="border border-zinc-800 rounded-3xl p-6">

              <div className="text-2xl font-bold mb-4">
                Consolidated Totals
              </div>

              <pre className="text-sm overflow-auto">
                {JSON.stringify(
                  report.consolidated,
                  null,
                  2
                )}
              </pre>

            </div>

            <div className="border border-zinc-800 rounded-3xl p-6">

              <div className="text-2xl font-bold mb-4">
                Entities
              </div>

              <pre className="text-sm overflow-auto">
                {JSON.stringify(
                  report.entities,
                  null,
                  2
                )}
              </pre>

            </div>

          </div>
        )}

      </div>

    </div>
  );
}
