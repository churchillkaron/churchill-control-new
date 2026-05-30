"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function CommandCenterPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/command",
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

  const center =
    data?.command_center;

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="mb-10">

          <h1 className="text-6xl font-bold">
            Operational Command Center
          </h1>

          <div className="text-zinc-500 mt-3">
            Autonomous Enterprise Intelligence Control Layer
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6 mb-10">

          <div className="text-zinc-500">
            Operational Status
          </div>

          <div className="text-5xl mt-4 text-green-400">
            {
              center?.operational_status || "-"
            }
          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

          <div>

            <div className="text-3xl mb-6">
              Alerts
            </div>

            <div className="space-y-6">

              {center?.alerts?.map(
                (
                  item,
                  index
                ) => (

                  <div
                    key={index}
                    className="border border-zinc-800 rounded-2xl p-6"
                  >

                    <div className="text-xl mb-4">
                      {item.type}
                    </div>

                    <div>
                      {item.message}
                    </div>

                  </div>
                )
              )}

            </div>

          </div>

          <div>

            <div className="text-3xl mb-6">
              Recommendations
            </div>

            <div className="space-y-6">

              {center?.recommendations?.map(
                (
                  item,
                  index
                ) => (

                  <div
                    key={index}
                    className="border border-zinc-800 rounded-2xl p-6"
                  >

                    <div className="flex items-center justify-between mb-4">

                      <div className="text-xl">
                        {item.category}
                      </div>

                      <div className="text-sm text-zinc-400">
                        {item.confidence}
                      </div>

                    </div>

                    <div>
                      {item.decision}
                    </div>

                  </div>
                )
              )}

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
