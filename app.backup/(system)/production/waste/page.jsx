"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function WastePage() {

  const [
    logs,
    setLogs,
  ] = useState([]);

  async function loadWasteLogs() {

    const {
      data,
    } = await supabase
      .from(
        "production_yield_logs"
      )
      .select("*")
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    setLogs(
      data || []
    );
  }

  useEffect(() => {

    loadWasteLogs();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Yield & Waste
        </h1>

        <div className="text-zinc-500 mb-10">
          Manufacturing Loss Intelligence
        </div>

        <div className="space-y-4">

          {logs.map(
            (
              log
            ) => (

              <div
                key={log.id}
                className="border border-zinc-800 rounded-3xl p-6"
              >

                <div className="grid grid-cols-5 gap-4">

                  <div>

                    <div className="text-zinc-500 text-sm">
                      Raw
                    </div>

                    <div className="text-2xl mt-2">
                      {
                        log.raw_quantity
                      }
                    </div>

                  </div>

                  <div>

                    <div className="text-zinc-500 text-sm">
                      Usable
                    </div>

                    <div className="text-2xl mt-2">
                      {
                        log.usable_quantity
                      }
                    </div>

                  </div>

                  <div>

                    <div className="text-zinc-500 text-sm">
                      Waste
                    </div>

                    <div className="text-2xl mt-2 text-red-400">
                      {
                        log.waste_quantity
                      }
                    </div>

                  </div>

                  <div>

                    <div className="text-zinc-500 text-sm">
                      Yield %
                    </div>

                    <div className="text-2xl mt-2 text-green-400">
                      {
                        log.yield_percent
                      }
                      %
                    </div>

                  </div>

                  <div>

                    <div className="text-zinc-500 text-sm">
                      Waste %
                    </div>

                    <div className="text-2xl mt-2 text-yellow-400">
                      {
                        log.waste_percent
                      }
                      %
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
