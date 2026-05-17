"use client";

import { useState } from "react";

export default function WorkflowPage() {

  const [
    result,
    setResult,
  ] = useState(null);

  async function createWorkflow() {

    await fetch(
      "/api/intelligence/workflows/register",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          tenant_id:
            "demo",
          name:
            "Auto Correct Performance",
          trigger_event:
            "LOW_PERFORMANCE",
          action:
            "RUN_CORRECTIVE_ACTION",
        }),
      }
    );

    alert(
      "Workflow registered"
    );
  }

  async function runWorkflow() {

    const res =
      await fetch(
        "/api/intelligence/workflows/run",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            tenant_id:
              "demo",
            event_type:
              "LOW_PERFORMANCE",
          }),
        }
      );

    const json =
      await res.json();

    setResult(json);
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-5xl font-bold mb-10">
        Workflow Engine
      </h1>

      <div className="flex gap-4 mb-10">

        <button
          onClick={
            createWorkflow
          }
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Register Workflow
        </button>

        <button
          onClick={
            runWorkflow
          }
          className="bg-zinc-800 px-6 py-3 rounded-xl"
        >
          Run Workflow
        </button>

      </div>

      {result && (

        <div className="border border-zinc-800 rounded-2xl p-6">

          <pre className="overflow-auto text-sm">
            {JSON.stringify(
              result,
              null,
              2
            )}
          </pre>

        </div>
      )}

    </div>
  );
}
