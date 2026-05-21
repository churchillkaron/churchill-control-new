"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function CopilotPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function loadCopilot() {

    const res =
      await fetch(
        "/api/intelligence/copilot",
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

    loadCopilot();

  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-5xl font-bold">
            Owner Copilot
          </h1>

          <div className="text-zinc-500 mt-2">
            AI Executive Command Layer
          </div>

        </div>

        <button
          onClick={
            loadCopilot
          }
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Refresh
        </button>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">
          <div className="text-zinc-500">
            Revenue
          </div>

          <div className="text-4xl mt-3">
            {data?.summary?.revenue || 0}
          </div>
        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">
          <div className="text-zinc-500">
            Operations
          </div>

          <div className="text-4xl mt-3">
            {data?.summary?.operations}
          </div>
        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">
          <div className="text-zinc-500">
            Customers
          </div>

          <div className="text-4xl mt-3">
            {data?.summary?.customers || 0}
          </div>
        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">
          <div className="text-zinc-500">
            Anomalies
          </div>

          <div className="text-4xl mt-3">
            {data?.summary?.anomalies || 0}
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-2xl mb-6">
            AI Recommendations
          </div>

          <div className="space-y-4">

            {data?.recommendations?.map(
              (
                item,
                index
              ) => (

                <div
                  key={index}
                  className="border border-zinc-800 rounded-xl p-4"
                >
                  <div className="text-zinc-500 text-sm">
                    {item.level}
                  </div>

                  <div className="mt-2">
                    {item.message}
                  </div>
                </div>
              )
            )}

          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-2xl mb-6">
            Priority Tasks
          </div>

          <div className="space-y-4">

            {data?.tasks?.map(
              (
                task,
                index
              ) => (

                <div
                  key={index}
                  className="border border-zinc-800 rounded-xl p-4"
                >
                  <div className="text-zinc-500 text-sm">
                    {task.priority}
                  </div>

                  <div className="mt-2">
                    {task.task}
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
