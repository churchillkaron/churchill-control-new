
"use client";

import { useEffect, useState } from "react";
import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";

export const dynamic = "force-dynamic";

export default function Page({ params }) {

  const [data,setData]=useState(null);
  const {
    financeGet,
    financePost,
    loading: runtimeLoading,
  } = useFinanceRuntime();

  const [loading,setLoading]=useState(true);

  useEffect(()=>{

    if(runtimeLoading){
      return;
    }

    financeGet("/api/finance/budgeting")

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

  },[runtimeLoading]);

  return(

    <main className="min-h-screen p-8 text-white">

      <div className="mx-auto max-w-7xl">

        <h1 className="text-4xl font-light">
          Budgeting
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
