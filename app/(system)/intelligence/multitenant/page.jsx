"use client";

import { useEffect, useState } from "react";

export default function MultiTenantPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/multitenant/portfolio"
      );

    const json =
      await res.json();

    setData(json);
  }

  useEffect(() => {

    load();

  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-5xl font-bold">
            Portfolio Intelligence
          </h1>

          <div className="text-zinc-500 mt-2">
            Multi-Location AI Overview
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Refresh
        </button>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Locations
          </div>

          <div className="text-5xl mt-4">
            {data?.total_locations || 0}
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Portfolio Revenue
          </div>

          <div className="text-5xl mt-4">
            {data?.portfolio_revenue || 0}
          </div>

        </div>

      </div>

      <div className="space-y-6">

        {data?.locations?.map(
          (
            item,
            index
          ) => (

            <div
              key={index}
              className="border border-zinc-800 rounded-2xl p-6"
            >

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-2xl">
                    {item.tenant_name}
                  </div>

                  <div className="text-zinc-500 mt-2">
                    {item.tenant_id}
                  </div>

                </div>

                <div className="text-right">

                  <div>
                    Revenue:
                    {" "}
                    {item.revenue}
                  </div>

                  <div className="mt-2">
                    Operations:
                    {" "}
                    {item.operations}
                  </div>

                  <div className="mt-2">
                    Customers:
                    {" "}
                    {item.customers}
                  </div>

                </div>

              </div>

            </div>
          )
        )}

      </div>

    </div>
  );
}
