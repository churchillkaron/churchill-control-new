"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunProductionButton({
  runtime,
}) {

  const router =
    useRouter();

  const [running,setRunning] =
    useState(false);

  const [summary,setSummary] =
    useState(null);

  async function run() {

    setRunning(true);

    setSummary(null);

    try {

      const res =
        await fetch(
          "/api/creative/production/queue",
          {
            method:"POST",
            headers:{
              "Content-Type":"application/json",
            },
            body:JSON.stringify({

              organization_id:
                runtime.organizationId,

              creative_project_id:
                runtime.projectRuntime?.current?.id,

            }),
          }
        );

      const json =
        await res.json();

      if(!res.ok)
        throw new Error(
          json.error ||
          "Production failed."
        );

      setSummary(
        json.result
      );

      router.refresh();

    }

    catch(error){

      alert(
        error.message
      );

    }

    finally{

      setRunning(false);

    }

  }

  return (

    <div className="flex flex-col items-end gap-2">

      <button
        onClick={run}
        disabled={running}
        className="
          rounded-xl
          border
          border-[#c8a96a]/30
          bg-[#b48a45]/10
          px-5
          py-2
          font-medium
          text-[#d8bd7a]
          disabled:opacity-50
        "
      >

        {running
          ? "Running Production..."
          : "▶ Run Production"}

      </button>

      {summary && (

        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">

          Dispatched {summary.total} task(s)

        </div>

      )}

    </div>

  );

}
