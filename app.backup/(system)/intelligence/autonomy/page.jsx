"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

export default function AutonomyPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function runEngine() {

    const res =
      await fetch(
        "/api/intelligence/autonomy/run",
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

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-5xl font-bold">
            Autonomous AI Engine
          </h1>

          <div className="text-zinc-500 mt-2">
            Self-Correcting Operational Intelligence
          </div>

        </div>

        <button
          onClick={
            runEngine
          }
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Run Engine
        </button>

      </div>

      {data && (

        <div className="space-y-8">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-2xl mb-6">
              Autonomous Decisions
            </div>

            <div className="space-y-4">

              {data.decisions?.length > 0 ? (

                data.decisions.map(
                  (
                    item,
                    index
                  ) => (

                    <div
                      key={index}
                      className="border border-zinc-800 rounded-xl p-4"
                    >

                      <div className="text-zinc-500 text-sm">
                        {item.type}
                      </div>

                      <pre className="mt-3 text-sm overflow-auto">
                        {JSON.stringify(
                          item,
                          null,
                          2
                        )}
                      </pre>

                    </div>
                  )
                )

              ) : (

                <div className="text-zinc-500">
                  No autonomous actions executed.
                </div>
              )}

            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-2xl mb-6">
              AI Recommendations
            </div>

            <div className="space-y-4">

              {data.recommendations?.map(
                (
                  rec,
                  index
                ) => (

                  <div
                    key={index}
                    className="border border-zinc-800 rounded-xl p-4"
                  >
                    <div className="text-zinc-500 text-sm">
                      {rec.level}
                    </div>

                    <div className="mt-2">
                      {rec.message}
                    </div>
                  </div>
                )
              )}

            </div>

          </div>

        </div>
      )}

    </div>
  );
}
