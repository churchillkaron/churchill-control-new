"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function FederationPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/federation"
      );

    const json =
      await res.json();

    setData(json);
  }

  useEffect(() => {

    load();

  }, []);

  const summary =
    data?.federation_summary;

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="mb-10">

          <h1 className="text-6xl font-bold">
            Enterprise Federation
          </h1>

          <div className="text-zinc-500 mt-3">
            Multi-Brand Intelligence Federation Layer
          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Brands
            </div>

            <div className="text-5xl mt-4">
              {summary?.brands || 0}
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Total Revenue
            </div>

            <div className="text-5xl mt-4">
              {
                summary?.total_revenue || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Total Valuation
            </div>

            <div className="text-5xl mt-4">
              {
                summary?.total_valuation || 0
              }
            </div>

          </div>

        </div>

        <div className="space-y-6">

          {data?.federation?.map(
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
                      Investment Score:
                      {" "}
                      {item.investment_score}
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
                      Valuation:
                      {" "}
                      {item.valuation}
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
