"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

export default function RevenueIntelligencePage() {

  const [
    data,
    setData,
  ] = useState(null);

  const [
    trends,
    setTrends,
  ] = useState([]);

  async function loadRevenueIntelligence() {

    const body = {
      tenant_id:
        "demo",
    };

    const [
      revenueRes,
      trendsRes,
    ] = await Promise.all([

      fetch(
        "/api/intelligence/revenue",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            body
          ),
        }
      ),

      fetch(
        "/api/intelligence/revenue/trends",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            body
          ),
        }
      ),
    ]);

    const revenueJson =
      await revenueRes.json();

    const trendsJson =
      await trendsRes.json();

    setData(
      revenueJson
    );

    setTrends(
      trendsJson.trends || []
    );
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

      {trends.length > 0 && (

        <div className="mt-12">

          <h2 className="text-2xl mb-6">
            Revenue Trends
          </h2>

          <div className="space-y-3">

            {trends.map(
              (
                trend,
                index
              ) => (

                <div
                  key={index}
                  className="border border-zinc-800 rounded-xl p-4 flex justify-between"
                >
                  <div>
                    {trend.date}
                  </div>

                  <div>
                    {trend.revenue}
                  </div>

                </div>
              )
            )}

          </div>

        </div>
      )}

    </div>
  );
}
