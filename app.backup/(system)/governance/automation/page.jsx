"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

export default function GovernanceAutomationPage() {

  const [
    result,
    setResult,
  ] = useState(null);

  async function runGovernance() {

    const res =
      await fetch(
        "/api/governance/automation",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            tenant_id:
              "demo",

            action_type:
              "PROCUREMENT",

            priority:
              "HIGH",

            amount:
              75000,
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
              AI Governance
            </h1>

            <div className="text-zinc-500">
              Autonomous Safety & Approval Engine
            </div>

          </div>

          <button
            onClick={
              runGovernance
            }
            className="bg-white text-black rounded-2xl px-8 py-4 font-bold"
          >
            RUN GOVERNANCE
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
