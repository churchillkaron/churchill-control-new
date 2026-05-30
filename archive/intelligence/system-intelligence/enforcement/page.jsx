"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function EnforcementPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/enforcement",
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

      <div className="max-w-7xl mx-auto">

        <div className="mb-10">

          <h1 className="text-6xl font-bold">
            Compliance Enforcement
          </h1>

          <div className="text-zinc-500 mt-3">
            Autonomous Compliance Restriction & Governance Enforcement
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6 mb-10">

          <div className="text-zinc-500">
            Enforcement Status
          </div>

          <div className="text-5xl mt-4 text-red-400">
            {
              data?.enforcement_status || "-"
            }
          </div>

        </div>

        <div className="space-y-6">

          {data?.enforcement_actions?.map(
            (
              item,
              index
            ) => (

              <div
                key={index}
                className="border border-zinc-800 rounded-2xl p-6"
              >

                <div className="flex items-center justify-between mb-4">

                  <div className="text-2xl">
                    {item.category}
                  </div>

                  <div className="text-sm text-zinc-400">
                    {item.severity}
                  </div>

                </div>

                <div className="text-lg mb-4">
                  {item.action}
                </div>

                <div className="text-red-400">
                  {item.enforcement}
                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
