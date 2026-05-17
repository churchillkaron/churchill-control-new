"use client";

import { useEffect, useState } from "react";

export default function SchedulerPage() {

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
          "/api/intelligence/scheduler",
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
              Autonomous Scheduler
            </h1>

            <div className="text-zinc-500 mt-3">
              AI Workforce Planning & Shift Intelligence
            </div>

          </div>

          <button
            onClick={load}
            disabled={loading}
            className="bg-white text-black px-8 py-4 rounded-2xl disabled:opacity-50"
          >
            {loading
              ? "Generating..."
              : "Generate Schedule"}
          </button>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Peak Day
            </div>

            <div className="text-5xl mt-4">
              {data?.peak_day}
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Low Day
            </div>

            <div className="text-5xl mt-4">
              {data?.low_day}
            </div>

          </div>

        </div>

        <div className="space-y-6">

          {data?.schedules?.map(
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
                      {item.employee}
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {item.role}
                    </div>

                    <div className="mt-4">
                      Peak Coverage:
                      {" "}
                      {item.assigned_peak_day}
                    </div>

                  </div>

                  <div className="text-right">

                    <div>
                      Shift:
                      {" "}
                      {item.shift}
                    </div>

                    <div className="mt-2">
                      Hours:
                      {" "}
                      {item.hours}
                    </div>

                    <div className="mt-2">
                      Low Day:
                      {" "}
                      {item.assigned_low_day}
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
