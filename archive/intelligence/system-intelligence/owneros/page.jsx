"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function OwnerOSPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/owneros",
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

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-6xl font-bold">
            Churchill Owner OS
          </h1>

          <div className="text-zinc-500 mt-3 text-lg">
            Unified Autonomous Hospitality Intelligence Platform
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-8 py-4 rounded-2xl"
        >
          Refresh
        </button>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Revenue
          </div>

          <div className="text-4xl mt-4">
            {
              data?.executive
                ?.revenue
                ?.total_revenue || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Customers
          </div>

          <div className="text-4xl mt-4">
            {
              data?.executive
                ?.customers
                ?.total_customers || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Optimizations
          </div>

          <div className="text-4xl mt-4">
            {
              data?.optimization
                ?.optimization_count || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Suppliers
          </div>

          <div className="text-4xl mt-4">
            {
              data?.suppliers
                ?.total_suppliers || 0
            }
          </div>

        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-2xl mb-6">
            Optimization Engine
          </div>

          <div className="space-y-4">

            {data?.optimization?.optimizations?.map(
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
                      {item.type}
                    </div>

                    <div className="text-zinc-500 text-sm">
                      {item.priority}
                    </div>

                  </div>

                  <div className="mt-3">
                    {item.recommendation}
                  </div>

                </div>
              )
            )}

          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-2xl mb-6">
            Demand Intelligence
          </div>

          <div className="space-y-4">

            {data?.demand?.demand?.map(
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
                      {item.day}
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

      </div>

      <div className="border border-zinc-800 rounded-2xl p-6">

        <div className="text-2xl mb-6">
          Portfolio Benchmark
        </div>

        <div className="space-y-4">

          {data?.benchmark?.all_locations?.map(
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
