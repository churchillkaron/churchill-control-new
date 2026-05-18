"use client";

import { useState } from "react";

export default function InventoryMonitoringPage() {

  const [
    result,
    setResult,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function runMonitoring() {

    try {

      setLoading(true);

      const res =
        await fetch(
          "/api/inventory/monitoring",
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

      setResult(
        json
      );

    } finally {

      setLoading(false);
    }
  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Inventory Monitoring
        </h1>

        <div className="text-zinc-500 mb-10">
          Expiry, Spoilage & Alert Intelligence
        </div>

        <button
          onClick={
            runMonitoring
          }
          disabled={
            loading
          }
          className="bg-white text-black rounded-2xl px-8 py-4 font-bold"
        >
          RUN MONITORING
        </button>

        {result && (

          <div className="mt-10 space-y-6">

            <div className="border border-zinc-800 rounded-3xl p-6">

              <div className="text-2xl font-bold mb-4">
                Auto Spoilage
              </div>

              <pre className="text-xs overflow-auto">
                {JSON.stringify(
                  result.spoilage,
                  null,
                  2
                )}
              </pre>

            </div>

            <div className="border border-zinc-800 rounded-3xl p-6">

              <div className="text-2xl font-bold mb-4">
                Inventory Alerts
              </div>

              <div className="space-y-4">

                {result.alerts?.alerts?.map(
                  (
                    alert,
                    index
                  ) => (

                    <div
                      key={index}
                      className="border border-zinc-800 rounded-2xl p-4"
                    >

                      <div className="flex items-center justify-between">

                        <div>

                          <div className="text-xl font-bold">
                            {
                              alert.item_name
                            }
                          </div>

                          <div className="text-zinc-500 mt-2">
                            {
                              alert.message
                            }
                          </div>

                        </div>

                        <div className="text-right">

                          <div>
                            {
                              alert.severity
                            }
                          </div>

                          <div className="text-zinc-500 mt-2">
                            {
                              alert.quantity
                            }
                            {" "}
                            {
                              alert.unit
                            }
                          </div>

                        </div>

                      </div>

                    </div>
                  )
                )}

              </div>

            </div>

          </div>
        )}

      </div>

    </div>
  );
}
