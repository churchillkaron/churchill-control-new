"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

export default function OwnerAgentPage() {

  const [
    data,
    setData,
  ] = useState(null);

  const [
    automation,
    setAutomation,
  ] = useState(null);

  async function runAgent() {

    const res =
      await fetch(
        "/api/intelligence/agents/owner",
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

  async function runAutomation() {

    const res =
      await fetch(
        "/api/intelligence/automation/run",
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

    setAutomation(json);
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-5xl font-bold mb-10">
        Owner AI Agent
      </h1>

      <div className="flex gap-4">

        <button
          onClick={runAgent}
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Run Owner Agent
        </button>

        <button
          onClick={
            runAutomation
          }
          className="bg-zinc-800 text-white px-6 py-3 rounded-xl"
        >
          Run Autonomous Analysis
        </button>

      </div>

      {data?.summary && (

        <div className="mt-10 space-y-6">

          <div className="border border-zinc-800 rounded-xl p-6">
            <div className="text-zinc-400 mb-2">
              Revenue
            </div>

            <div className="text-3xl">
              {
                data.summary
                  .overview
                  ?.revenue
                  ?.total_revenue
              }
            </div>
          </div>

        </div>
      )}

      {automation?.payload && (

        <div className="mt-10 border border-zinc-800 rounded-xl p-6">

          <div className="text-zinc-400 mb-4">
            Autonomous Analysis Completed
          </div>

          <pre className="overflow-auto text-sm">
            {JSON.stringify(
              automation.payload,
              null,
              2
            )}
          </pre>

        </div>
      )}

    </div>
  );
}
