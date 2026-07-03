import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";
"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

export default function YearEndPage() {

  const [status,setStatus]=useState({});
  const {
  organization,
  entity,
  period,
  loading: runtimeLoading,
} = useFinanceRuntime();

  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    load();
  },[]);

  async function load(){

    try{

      setLoading(true);

      const res =
        await fetch("/api/finance/year-end/status");

      const json =
        await res.json();

      setStatus(
        json.status ||
        json.data ||
        json ||
        {}
      );

    }catch{

      setStatus({});

    }finally{

      setLoading(false);

    }

  }

  const cards=useMemo(()=>[

    {
      title:"Fiscal Year",
      value:status.fiscal_year||"-"
    },

    {
      title:"Close Status",
      value:status.close_status||"OPEN"
    },

    {
      title:"Outstanding Tasks",
      value:status.outstanding_tasks||0
    },

    {
      title:"Closing Journals",
      value:status.closing_journals||0
    }

  ],[status]);

  return(

    <main className="min-h-screen p-8 text-white">

      <div className="mx-auto max-w-7xl">

        <div className="flex items-center justify-between">

          <div>

            <div className="text-xs uppercase tracking-[0.35em] text-white/50">
              Finance / Period Close
            </div>

            <h1 className="mt-3 text-4xl font-light">
              Year End Close
            </h1>

            <p className="mt-2 text-white/60">
              Manage fiscal year closing, retained earnings and opening balances.
            </p>

          </div>

          <button
            onClick={load}
            className="rounded-xl bg-blue-600 px-5 py-3"
          >
            Refresh
          </button>

        </div>

        <div className="mt-8 grid grid-cols-4 gap-4">

          {cards.map(card=>(

            <div
              key={card.title}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
            >

              <div className="text-sm text-white/50">
                {card.title}
              </div>

              <div className="mt-2 text-3xl font-light">
                {loading ? "..." : card.value}
              </div>

            </div>

          ))}

        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6">

          <h2 className="text-xl">
            Year-End Checklist
          </h2>

          <ul className="mt-4 space-y-3 text-white/70">

            <li>• Close all accounting periods</li>
            <li>• Complete reconciliations</li>
            <li>• Post all adjustment journals</li>
            <li>• Calculate retained earnings</li>
            <li>• Generate opening balances</li>
            <li>• Lock fiscal year</li>

          </ul>

        </div>

      </div>

    </main>

  );

}
