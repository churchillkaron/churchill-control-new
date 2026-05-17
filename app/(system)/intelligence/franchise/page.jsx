"use client";

import { useEffect, useState } from "react";

export default function FranchiseNetworkPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/franchise"
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
            Franchise Intelligence Network
          </h1>

          <div className="text-zinc-500 mt-3">
            Cross-Location Enterprise Intelligence Layer
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-8 py-4 rounded-2xl"
        >
          Refresh
        </button>

      </div>

      <div className="border border-zinc-800 rounded-2xl p-6 mb-10">

        <div className="text-zinc-500">
          Total Locations
        </div>

        <div className="text-5xl mt-4">
          {data?.total_locations || 0}
        </div>

      </div>

      <div className="border border-zinc-800 rounded-2xl p-6 mb-10">

        <div className="text-2xl mb-6">
          Top Performers
        </div>

        <div className="space-y-4">

          {data?.top_performers?.map(
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
                      #{index + 1}
                      {" "}
                      {item.tenant_name}
                    </div>

                    <div className="text-zinc-500 mt-2">
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

      <div className="space-y-6">

        {data?.network?.map(
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
                    {item.tenant_name}
                  </div>

                  <div className="text-zinc-500 mt-2">
                    {item.operations}
                  </div>

                  <div className="mt-4">
                    Peak Day:
                    {" "}
                    {item.peak_day}
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

                  <div className="mt-2">
                    Peak Revenue:
                    {" "}
                    {item.peak_revenue}
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
