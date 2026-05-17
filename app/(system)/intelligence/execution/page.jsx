"use client";

import { useState } from "react";

export default function ExecutiveExecutionPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function runExecution() {

    const res =
      await fetch(
        "/api/intelligence/execution/run",
        {
          method: "POST",
        }
      );

    const json =
      await res.json();

    setData(json);
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-5xl font-bold">
            Executive Automation
          </h1>

          <div className="text-zinc-500 mt-2">
            Portfolio-Level Autonomous Execution
          </div>

        </div>

        <button
          onClick={
            runExecution
          }
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Run Automation
        </button>

      </div>

      {data && (

        <div className="space-y-8">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Portfolio Revenue
            </div>

            <div className="text-5xl mt-4">
              {data.portfolio_revenue}
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-2xl mb-6">
              Executed Actions
            </div>

            <div className="space-y-4">

              {data.actions?.length > 0 ? (

                data.actions.map(
                  (
                    item,
                    index
                  ) => (

                    <div
                      key={index}
                      className="border border-zinc-800 rounded-xl p-4"
                    >

                      <div className="text-zinc-500 text-sm">
                        {item.tenant}
                      </div>

                      <div className="mt-2">
                        {item.action}
                      </div>

                    </div>
                  )
                )

              ) : (

                <div className="text-zinc-500">
                  No executive actions executed.
                </div>
              )}

            </div>

          </div>

        </div>
      )}

    </div>
  );
}
