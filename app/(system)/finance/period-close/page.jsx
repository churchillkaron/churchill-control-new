"use client";

import { useState } from "react";

export default function PeriodClosePage() {

  const [
    result,
    setResult,
  ] = useState(null);

  async function runYearEnd() {

    const res =
      await fetch(
        "/api/finance/period-close",
        {

          method: "PUT",

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

    setResult(
      json
    );
  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-6xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Financial Close
        </h1>

        <div className="text-zinc-500 mb-10">
          Period Close & Year-End Engine
        </div>

        <button
          onClick={
            runYearEnd
          }
          className="bg-white text-black rounded-2xl px-8 py-4 font-bold"
        >
          RUN YEAR END CLOSE
        </button>

        {result && (

          <div className="mt-10 border border-zinc-800 rounded-3xl p-6">

            <pre className="text-sm overflow-auto">
              {JSON.stringify(
                result,
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
