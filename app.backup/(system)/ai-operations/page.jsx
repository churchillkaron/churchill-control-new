"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

export default function AIOperationsPage() {

  const [
    result,
    setResult,
  ] = useState(null);

  async function runOperationsAI() {

    const res =
      await fetch(
        "/api/ai-operations",
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

    setResult(
      json
    );
  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold mb-3">
              AI Operations
            </h1>

            <div className="text-zinc-500">
              Autonomous Restaurant Intelligence
            </div>

          </div>

          <button
            onClick={
              runOperationsAI
            }
            className="bg-white text-black rounded-2xl px-8 py-4 font-bold"
          >
            RUN AI
          </button>

        </div>

        {result && (

          <div className="border border-zinc-800 rounded-3xl p-6">

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
