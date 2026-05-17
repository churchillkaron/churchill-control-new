"use client";

import { useState } from "react";

export default function CustomerInsightsPage() {

  const [
    insights,
    setInsights,
  ] = useState(null);

  async function loadInsights() {

    const res =
      await fetch(
        "/api/intelligence/customers",
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
        Customer Intelligence
      </h1>

      <button
        onClick={
          loadInsights
        }
        className="bg-white text-black px-6 py-3 rounded-xl"
      >
        Analyze Customers
      </button>

      {insights && (

        <div className="mt-10 space-y-4">

          <div>
            Total Customers:
            {" "}
            {insights.total_customers}
          </div>

          <div>
            Completed Orders:
            {" "}
            {insights.completed_orders}
          </div>

          <div>
            Customer Revenue:
            {" "}
            {insights.customer_revenue}
          </div>

          <div>
            Avg Customer Spend:
            {" "}
            {insights.average_customer_spend}
          </div>

        </div>
      )}

    </div>
  );
}
