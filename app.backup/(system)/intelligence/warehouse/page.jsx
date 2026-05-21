"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function WarehousePage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/warehouse",
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

  }, []);

  const warehouse =
    data?.warehouse;

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-6xl font-bold">
            Enterprise Reporting Warehouse
          </h1>

          <div className="text-zinc-500 mt-3">
            Unified Enterprise Intelligence Data Layer
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-8 py-4 rounded-2xl"
        >
          Refresh
        </button>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Revenue
          </div>

          <div className="text-5xl mt-4">
            {
              warehouse?.executive
                ?.revenue
                ?.total_revenue || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Customers
          </div>

          <div className="text-5xl mt-4">
            {
              warehouse?.customers
                ?.summary
                ?.total_customers || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Campaigns
          </div>

          <div className="text-5xl mt-4">
            {
              warehouse?.marketing
                ?.summary
                ?.campaigns || 0
            }
          </div>

        </div>

      </div>

      <div className="space-y-6">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-2xl mb-6">
            Demand Intelligence
          </div>

          <pre className="overflow-auto text-sm">
            {JSON.stringify(
              warehouse?.demand,
              null,
              2
            )}
          </pre>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-2xl mb-6">
            Production Intelligence
          </div>

          <pre className="overflow-auto text-sm">
            {JSON.stringify(
              warehouse?.production,
              null,
              2
            )}
          </pre>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-2xl mb-6">
            Payroll Intelligence
          </div>

          <pre className="overflow-auto text-sm">
            {JSON.stringify(
              warehouse?.payroll,
              null,
              2
            )}
          </pre>

        </div>

      </div>

    </div>
  );
}
