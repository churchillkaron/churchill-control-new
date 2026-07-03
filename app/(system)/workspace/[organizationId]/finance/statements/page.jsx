"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";
import { financeFetch } from "@/lib/finance/runtime/financeFetch";

export default function FinancialStatementsPage(){

  const [reports,setReports]=useState([]);
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
        await fetch("/api/finance/reports/profit-loss");

      const json =
        await res.json();

      setReports(
        json.reports ||
        json.data ||
        []
      );

    }catch{

      setReports([]);

    }finally{

      setLoading(false);

    }

  }

  return(

    <main className="min-h-screen p-8 text-white">

      <div className="mx-auto max-w-7xl">

        <div className="flex items-center justify-between">

          <div>

            <div className="text-xs uppercase tracking-[0.35em] text-white/50">
              Finance / Reporting
            </div>

            <h1 className="mt-3 text-4xl font-light">
              Financial Statements
            </h1>

            <p className="mt-2 text-white/60">
              Balance Sheet, Profit & Loss, Cash Flow and statutory statements.
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

          <Card title="Balance Sheet"/>
          <Card title="Profit & Loss"/>
          <Card title="Cash Flow"/>
          <Card title="Trial Balance"/>

        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">

          <table className="w-full">

            <thead className="border-b border-white/10">

              <tr className="text-left text-sm text-white/60">

                <th className="p-4">Statement</th>
                <th className="p-4">Period</th>
                <th className="p-4">Status</th>
                <th className="p-4">Generated</th>

              </tr>

            </thead>

            <tbody>

              {loading && (

                <tr>

                  <td
                    colSpan={4}
                    className="p-8 text-center text-white/60"
                  >
                    Loading...
                  </td>

                </tr>

              )}

              {!loading && reports.length===0 && (

                <tr>

                  <td
                    colSpan={4}
                    className="p-8 text-center text-white/60"
                  >
                    No generated statements.
                  </td>

                </tr>

              )}

              {reports.map((r,i)=>(

                <tr
                  key={r.id||i}
                  className="border-t border-white/5"
                >

                  <td className="p-4">
                    {r.name||r.report_name||"-"}
                  </td>

                  <td className="p-4">
                    {r.period||"-"}
                  </td>

                  <td className="p-4">
                    {r.status||"Generated"}
                  </td>

                  <td className="p-4">
                    {r.generated_at||r.created_at||"-"}
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

function Card({title}){

  return(

    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">

      <div className="text-sm text-white/50">
        Report
      </div>

      <div className="mt-2 text-2xl font-light">
        {title}
      </div>

    </div>

  );

}
