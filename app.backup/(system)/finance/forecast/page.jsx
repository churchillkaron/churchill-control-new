"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

export default function ForecastPage() {

  const [
    forecast,
    setForecast,
  ] = useState(null);

  async function loadForecast() {

    const res =
      await fetch(
        "/api/finance/forecast",
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
        Revenue Forecast
      </h1>

      <button
        onClick={
          loadForecast
        }
        className="bg-white text-black px-6 py-3 rounded-xl"
      >
        Generate Forecast
      </button>

      {forecast && (

        <div className="mt-10 space-y-4">

          <div>
            Avg Daily Revenue:
            {" "}
            {forecast.average_daily_revenue}
          </div>

          <div>
            Projected 30 Days:
            {" "}
            {forecast.projected_30_day_revenue}
          </div>

        </div>
      )}

    </div>
  );
}
