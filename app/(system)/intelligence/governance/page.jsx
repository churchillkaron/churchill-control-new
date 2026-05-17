"use client";

import { useEffect, useState } from "react";

export default function GovernanceAIPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/governance",
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
            AI Governance Engine
          </h1>

          <div className="text-zinc-500 mt-3">
            Enterprise Approval & Control Intelligence
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-8 py-4 rounded-2xl"
        >
          Refresh
        </button>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Requests
          </div>

          <div className="text-4xl mt-4">
            {
              data?.summary
                ?.total_requests || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Pending
          </div>

          <div className="text-4xl mt-4">
            {
              data?.summary
                ?.pending || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Approved
          </div>

          <div className="text-4xl mt-4">
            {
              data?.summary
                ?.approved || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Rejected
          </div>

          <div className="text-4xl mt-4">
            {
              data?.summary
                ?.rejected || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Approval %
          </div>

          <div className="text-4xl mt-4">
            {
              data?.summary
                ?.approval_rate || 0
            }%
          </div>

        </div>

      </div>

      <div className="border border-zinc-800 rounded-2xl p-6 mb-10">

        <div className="text-2xl mb-6">
          Approval Categories
        </div>

        <div className="space-y-4">

          {data?.categories?.map(
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
                    {item.category}
                  </div>

                  <div className="text-right">

                    <div>
                      Requests:
                      {" "}
                      {item.total}
                    </div>

                    <div className="mt-2">
                      Amount:
                      {" "}
                      {item.amount}
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
