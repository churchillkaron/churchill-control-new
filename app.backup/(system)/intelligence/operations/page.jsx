"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

export default function OperationsIntelligencePage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function loadHealth() {

    const res =
      await fetch(
        "/api/intelligence/operations",
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

      <h1 className="text-4xl font-bold mb-8">
        Operational Intelligence
      </h1>

      <button
        onClick={
          loadHealth
        }
        className="bg-white text-black px-6 py-3 rounded-xl"
      >
        Analyze Operations
      </button>

      {data && (

        <div className="mt-10 space-y-4">

          <div>
            Status:
            {" "}
            {data.status}
          </div>

          <div>
            Completion Rate:
            {" "}
            {Math.round(
              data.completion_rate || 0
            )}%
          </div>

          <div>
            Waste Cost:
            {" "}
            {data.waste_cost}
          </div>

          <div>
            Pending Approvals:
            {" "}
            {data.pending_approvals}
          </div>

        </div>
      )}

    </div>
  );
}
