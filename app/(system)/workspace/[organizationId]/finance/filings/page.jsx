import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";
"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

export default function TaxFilingsPage() {

  const [filings,setFilings]=useState([]);
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
        await fetch("/api/finance/tax/runtime");

      const json =
        await res.json();

      setFilings(
        json.filings ||
        json.data ||
        []
      );

    }catch{

      setFilings([]);

    }finally{

      setLoading(false);

    }

  }

  const stats=useMemo(()=>({

    total:filings.length,

    draft:
      filings.filter(f=>f.status==="DRAFT").length,

    ready:
      filings.filter(f=>f.status==="READY").length,

    submitted:
      filings.filter(f=>f.status==="SUBMITTED").length,

    approved:
      filings.filter(f=>f.status==="APPROVED").length,

  }),[filings]);

  return(

    <main className="min-h-screen p-8 text-white">

      <div className="mx-auto max-w-7xl">

        <div className="flex items-center justify-between">

          <div>

            <div className="text-xs uppercase tracking-[0.35em] text-white/50">
              Finance / Tax
            </div>

            <h1 className="mt-3 text-4xl font-light">
              Tax Filings
            </h1>

            <p className="mt-2 text-white/60">
              VAT, withholding and corporate tax submissions.
            </p>

          </div>

          <button
            onClick={load}
            className="rounded-xl bg-blue-600 px-5 py-3"
          >
            Refresh
          </button>

        </div>

        <div className="mt-8 grid grid-cols-5 gap-4">

          <Card title="Total" value={stats.total}/>
          <Card title="Draft" value={stats.draft}/>
          <Card title="Ready" value={stats.ready}/>
          <Card title="Submitted" value={stats.submitted}/>
          <Card title="Approved" value={stats.approved}/>

        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">

          <table className="w-full">

            <thead className="border-b border-white/10">

              <tr className="text-left text-sm text-white/60">

                <th className="p-4">Type</th>
                <th className="p-4">Period</th>
                <th className="p-4">Due Date</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Status</th>

              </tr>

            </thead>

            <tbody>

              {loading && (

                <tr>

                  <td
                    colSpan={5}
                    className="p-8 text-center text-white/60"
                  >
                    Loading...
                  </td>

                </tr>

              )}

              {!loading && filings.length===0 && (

                <tr>

                  <td
                    colSpan={5}
                    className="p-8 text-center text-white/60"
                  >
                    No tax filings.
                  </td>

                </tr>

              )}

              {filings.map((f,i)=>(

                <tr
                  key={f.id||i}
                  className="border-t border-white/5"
                >

                  <td className="p-4">
                    {f.filing_type||"-"}
                  </td>

                  <td className="p-4">
                    {f.filing_period||"-"}
                  </td>

                  <td className="p-4">
                    {f.due_date||"-"}
                  </td>

                  <td className="p-4">
                    {Number(
                      f.net_tax||
                      f.amount||
                      0
                    ).toLocaleString()}
                  </td>

                  <td className="p-4">
                    {f.status||"-"}
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

    </main>

  );

}

function Card({title,value}){

  return(

    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">

      <div className="text-sm text-white/50">
        {title}
      </div>

      <div className="mt-2 text-3xl font-light">
        {value}
      </div>

    </div>

  );

}
