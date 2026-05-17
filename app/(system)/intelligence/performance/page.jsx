"use client";

import { useState } from "react";

export default function PerformancePage() {

  const [
    insights,
    setInsights,
  ] = useState(null);

  async function loadInsights() {

    const res =
      await fetch(
        "/api/intelligence/performance",
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

    const data =
      await res.json();

    setInsights(data);
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-4xl font-bold mb-8">
        Performance Intelligence
      </h1>

      <button
        onClick={
          loadInsights
        }
        className="bg-white text-black px-6 py-3 rounded-xl"
      >
        Generate Insights
      </button>

      {insights && (

        <div className="mt-10 space-y-4">

          <div>
            Total Orders:
            {" "}
            {insights.total_orders}
          </div>

          <div>
            Completed Orders:
            {" "}
            {insights.completed_orders}
          </div>

          <div>
            Completion Rate:
            {" "}
            {Math.round(
              insights.completion_rate || 0
            )}%
          </div>

          <div>
            Performance:
            {" "}
            {insights.performance}
          </div>

        </div>
      )}

    </div>
  );
}
