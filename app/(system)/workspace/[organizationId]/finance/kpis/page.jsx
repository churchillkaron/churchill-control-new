
"use client";

import { useEffect, useState } from "react";
import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";
import { financeFetch } from "@/lib/finance/runtime/financeFetch";

export const dynamic = "force-dynamic";

export default function Page({ params }) {

  const [data,setData]=useState(null);
  const {
  organization,
  entity,
  period,
  loading: runtimeLoading,
} = useFinanceRuntime();

  const [loading,setLoading]=useState(true);

  useEffect(()=>{

    financeFetch({
      organization,
      entity,
      period,
      path: "/api/finance/kpis",
    })

      .then(r=>r.json())

      .then(d=>{
        setData(d);
        setLoading(false);
      })

      .catch(e=>{
        setData({
          success:false,
          error:e.message
        });
        setLoading(false);
      });

  },[]);

  return(

    <main className="min-h-screen p-8 text-white">

      <div className="mx-auto max-w-7xl">

        <h1 className="text-4xl font-light">
          Kpis
        </h1>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6">

          {loading ? (

            <div>Loading...</div>

          ) : (

            <pre className="overflow-auto text-xs whitespace-pre-wrap">
{JSON.stringify(data,null,2)}
            </pre>

          )}

        </div>

      </div>

    </main>

  );

}
