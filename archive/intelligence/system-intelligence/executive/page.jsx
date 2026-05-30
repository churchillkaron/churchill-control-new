"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

export default function ExecutivePage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function loadOverview() {

    const res =
      await fetch(
        "/api/intelligence/executive",
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

      <h1 className="text-5xl font-bold mb-10">
        Executive Intelligence
      </h1>

      <button
        onClick={
          loadOverview
        }
        className="bg-white text-black px-6 py-3 rounded-xl"
      >
        Generate Executive Overview
      </button>

      {data && (

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">

          <div className="border border-zinc-800 rounded-xl p-6">
            <div className="text-zinc-400">
              Revenue
            </div>

            <div className="text-3xl mt-2">
              {data.revenue?.total_revenue}
            </div>
          </div>

          <div className="border border-zinc-800 rounded-xl p-6">
            <div className="text-zinc-400">
              Operations
            </div>

            <div className="text-3xl mt-2">
              {data.operations?.status}
            </div>
          </div>

          <div className="border border-zinc-800 rounded-xl p-6">
            <div className="text-zinc-400">
              Customers
            </div>

            <div className="text-3xl mt-2">
              {data.customers?.total_customers}
            </div>
          </div>

          <div className="border border-zinc-800 rounded-xl p-6">
            <div className="text-zinc-400">
              Forecast
            </div>

            <div className="text-3xl mt-2">
              {data.forecast?.demand_status}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
