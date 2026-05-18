"use client";

import { useState } from "react";

export default function ReconciliationPage() {

  const [
    result,
    setResult,
  ] = useState(null);

  async function runReconciliation() {

    const res =
      await fetch(
        "/api/finance/reconciliation",
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

    setResult(
      json
    );
  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-6xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Bank Reconciliation
        </h1>

        <div className="text-zinc-500 mb-10">
          Treasury Reconciliation Engine
        </div>

        <button
          onClick={
            runReconciliation
          }
          className="bg-white text-black rounded-2xl px-8 py-4 font-bold"
        >
          RUN RECONCILIATION
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
