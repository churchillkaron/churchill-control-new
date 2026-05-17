"use client";

import { useState } from "react";

export default function AnomalyPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function runDetection() {

    const res =
      await fetch(
        "/api/intelligence/anomaly/detect",
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

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-5xl font-bold mb-10">
        AI Anomaly Detection
      </h1>

      <button
        onClick={
          runDetection
        }
        className="bg-white text-black px-6 py-3 rounded-xl"
      >
        Run Detection
      </button>

      {data && (

        <div className="mt-10 space-y-6">

          <div className="border border-zinc-800 rounded-xl p-6">
            <div>
              Average Order:
              {" "}
              {data.average_order}
            </div>

            <div className="mt-2">
              Anomalies:
              {" "}
              {data.anomaly_count}
            </div>
          </div>

          {data.anomalies?.map(
            (
              anomaly,
              index
            ) => (

              <div
                key={index}
                className="border border-red-800 rounded-xl p-6"
              >
                <div>
                  {anomaly.type}
                </div>

                <div className="mt-2">
                  {anomaly.value}
                </div>
              </div>
            )
          )}

        </div>
      )}

    </div>
  );
}
