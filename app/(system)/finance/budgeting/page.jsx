"use client";

import { useState } from "react";

export default function BudgetingPage() {

  const [
    forecast,
    setForecast,
  ] = useState(null);

  const [
    variance,
    setVariance,
  ] = useState(null);

  async function generateForecast() {

    const res =
      await fetch(
        "/api/finance/budgeting",
        {

          method: "PUT",

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

    setForecast(
      json
    );
  }

  async function runVariance() {

    const res =
      await fetch(
        "/api/finance/budgeting",
        {

          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            tenant_id:
              "demo",

            fiscal_year:
              "2026",
          }),
        }
      );

    const json =
      await res.json();

    setVariance(
      json
    );
  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Budgeting & Forecasting
        </h1>

        <div className="text-zinc-500 mb-10">
          Enterprise Performance Management
        </div>

        <div className="flex gap-4 mb-10">

          <button
            onClick={
              generateForecast
            }
            className="bg-white text-black rounded-2xl px-6 py-4 font-bold"
          >
            FORECAST
          </button>

          <button
            onClick={
              runVariance
            }
            className="bg-zinc-900 border border-zinc-700 rounded-2xl px-6 py-4 font-bold"
          >
            VARIANCE
          </button>

        </div>

        {forecast && (

          <div className="border border-zinc-800 rounded-3xl p-6 mb-6">

            <div className="text-2xl font-bold mb-4">
              Forecast
            </div>

            <pre className="text-sm overflow-auto">
              {JSON.stringify(
                forecast,
                null,
                2
              )}
            </pre>

          </div>
        )}

        {variance && (

          <div className="border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-bold mb-4">
              Variance Analysis
            </div>

            <pre className="text-sm overflow-auto">
              {JSON.stringify(
                variance,
                null,
                2
              )}
            </pre>

          </div>
        )}

      </div>

    </div>
  );
}
