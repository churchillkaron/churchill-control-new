"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

export default function ForecastingPage() {

  const [
    forecast,
    setForecast,
  ] = useState(null);

  async function generateForecast() {

    const res =
      await fetch(
        "/api/intelligence/forecasting",
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

    setForecast(data);
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-4xl font-bold mb-8">
        Demand Forecasting
      </h1>

      <button
        onClick={
          generateForecast
        }
        className="bg-white text-black px-6 py-3 rounded-xl"
      >
        Generate Forecast
      </button>

      {forecast && (

        <div className="mt-10 space-y-4">

          <div>
            Current Orders:
            {" "}
            {forecast.current_orders}
          </div>

          <div>
            Weekly Projection:
            {" "}
            {forecast.projected_weekly_orders}
          </div>

          <div>
            Monthly Projection:
            {" "}
            {forecast.projected_monthly_orders}
          </div>

          <div>
            Demand Status:
            {" "}
            {forecast.demand_status}
          </div>

        </div>
      )}

    </div>
  );
}
