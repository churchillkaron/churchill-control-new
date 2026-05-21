"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

export default function RevenueAnalyticsPage() {

  const [
    analytics,
    setAnalytics,
  ] = useState(null);

  async function loadAnalytics() {

    const res =
      await fetch(
        "/api/analytics/revenue",
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

    setAnalytics(data);
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-4xl font-bold mb-8">
        Revenue Analytics
      </h1>

      <button
        onClick={
          loadAnalytics
        }
        className="bg-white text-black px-6 py-3 rounded-xl"
      >
        Load Analytics
      </button>

      {analytics && (

        <div className="mt-10 space-y-4">

          <div>
            Revenue:
            {" "}
            {analytics.total_revenue}
          </div>

          <div>
            Orders:
            {" "}
            {analytics.total_orders}
          </div>

          <div>
            Avg Order:
            {" "}
            {analytics.average_order_value}
          </div>

        </div>
      )}

    </div>
  );
}
