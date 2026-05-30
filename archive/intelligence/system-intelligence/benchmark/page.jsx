"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function BenchmarkPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/benchmark"
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
            Cross-Location Benchmark
          </h1>

          <div className="text-zinc-500 mt-2">
            AI Portfolio Performance Rankings
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Refresh
        </button>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-2xl mb-6">
            Top Revenue
          </div>

          <div className="space-y-4">

            {data?.top_revenue_locations?.map(
              (
                item,
                index
              ) => (

                <div
                  key={index}
                  className="border border-zinc-800 rounded-xl p-4"
                >

                  <div className="flex items-center justify-between">

                    <div>
                      #{index + 1}
                      {" "}
                      {item.tenant_name}
                    </div>

                    <div>
                      {item.revenue}
                    </div>

                  </div>

                </div>
              )
            )}

          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-2xl mb-6">
            Top Customers
          </div>

          <div className="space-y-4">

            {data?.top_customer_locations?.map(
              (
                item,
                index
              ) => (

                <div
                  key={index}
                  className="border border-zinc-800 rounded-xl p-4"
                >

                  <div className="flex items-center justify-between">

                    <div>
                      #{index + 1}
                      {" "}
                      {item.tenant_name}
                    </div>

                    <div>
                      {item.customers}
                    </div>

                  </div>

                </div>
              )
            )}

          </div>

        </div>

      </div>

      <div className="border border-zinc-800 rounded-2xl p-6">

        <div className="text-2xl mb-6">
          All Locations
        </div>

        <div className="space-y-4">

          {data?.all_locations?.map(
            (
              item,
              index
            ) => (

              <div
                key={index}
                className="border border-zinc-800 rounded-xl p-4"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-xl">
                      {item.tenant_name}
                    </div>

                    <div className="text-zinc-500 text-sm mt-2">
                      {item.operations}
                    </div>

                  </div>

                  <div className="text-right">

                    <div>
                      Revenue:
                      {" "}
                      {item.revenue}
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

    </div>
  );
}
