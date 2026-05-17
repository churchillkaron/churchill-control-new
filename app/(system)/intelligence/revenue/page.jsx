"use client";

import { useState } from "react";

export default function RevenueIntelligencePage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function loadRevenueIntelligence() {

    const res =
      await fetch(
        "/api/intelligence/revenue",
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
        Revenue Intelligence
      </h1>

      <button
        onClick={
          loadRevenueIntelligence
        }
        className="bg-white text-black px-6 py-3 rounded-xl"
      >
        Analyze Revenue
      </button>

      {data && (

        <div className="mt-10 space-y-4">

          <div>
            Total Revenue:
            {" "}
            {data.total_revenue}
          </div>

          <div>
            Transactions:
            {" "}
            {data.total_transactions}
          </div>

          <div>
            Average Transaction:
            {" "}
            {data.average_transaction}
          </div>

          <div>
            Revenue Status:
            {" "}
            {data.revenue_status}
          </div>

        </div>
      )}

    </div>
  );
}
