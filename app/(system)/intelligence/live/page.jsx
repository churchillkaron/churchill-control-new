"use client";

import { useEffect, useState } from "react";

export default function LiveCommandCenterPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/live",
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

    load();

    const interval =
      setInterval(
        load,
        10000
      );

    return () =>
      clearInterval(
        interval
      );

  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-5xl font-bold">
            AI Command Center
          </h1>

          <div className="text-zinc-500 mt-2">
            Live Operational Intelligence
          </div>

        </div>

        <div className="text-zinc-500">
          {data?.updated_at}
        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

        <div className="border border-zinc-800 rounded-2xl p-6">
          <div className="text-zinc-500">
            Revenue
          </div>

          <div className="text-4xl mt-3">
            {data?.revenue || 0}
          </div>
        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">
          <div className="text-zinc-500">
            Operations
          </div>

          <div className="text-4xl mt-3">
            {data?.operations}
          </div>
        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">
          <div className="text-zinc-500">
            Performance
          </div>

          <div className="text-4xl mt-3">
            {data?.performance}
          </div>
        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">
          <div className="text-zinc-500">
            Customers
          </div>

          <div className="text-4xl mt-3">
            {data?.customers || 0}
          </div>
        </div>

      </div>

      <div className="mt-10 border border-zinc-800 rounded-2xl p-6">

        <div className="text-2xl mb-6">
          AI Alerts
        </div>

        <div className="space-y-4">

          {data?.alerts?.length > 0 ? (

            data.alerts.map(
              (
                alert,
                index
              ) => (

                <div
                  key={index}
                  className="border border-red-900 bg-red-950/30 rounded-xl p-4"
                >
                  {alert}
                </div>
              )
            )

          ) : (

            <div className="text-zinc-500">
              No active alerts
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
