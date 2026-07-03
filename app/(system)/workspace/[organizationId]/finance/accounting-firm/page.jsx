import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";
"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

export default function AccountingFirmPage() {

  const [clients,setClients]=useState([]);
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
        await fetch("/api/finance/accounting-firm/dashboard");

      const json =
        await res.json();

      setClients(
        json.clients ||
        json.data ||
        []
      );

    }catch{

      setClients([]);

    }finally{

      setLoading(false);

    }

  }

  const stats = useMemo(()=>({

    clients:
      clients.length,

    entities:
      clients.reduce((n,c)=>n+Number(c.entity_count||0),0),

    filings:
      clients.reduce((n,c)=>n+Number(c.pending_filings||0),0),

    periods:
      clients.reduce((n,c)=>n+Number(c.open_periods||0),0),

  }),[clients]);

  return(

    <main className="min-h-screen p-8 text-white">

      <div className="mx-auto max-w-7xl">

        <div className="flex items-center justify-between">

          <div>

            <div className="text-xs uppercase tracking-[0.35em] text-white/50">
              Finance / Accounting Firm
            </div>

            <h1 className="mt-3 text-4xl font-light">
              Accounting Firm
            </h1>

            <p className="mt-2 text-white/60">
              Manage accounting clients, legal entities, filings, periods and consolidated reporting.
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

          <Card title="Clients" value={stats.clients}/>
          <Card title="Entities" value={stats.entities}/>
          <Card title="Open Periods" value={stats.periods}/>
          <Card title="Pending Filings" value={stats.filings}/>

        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">

          <table className="w-full">

            <thead className="border-b border-white/10">

              <tr className="text-left text-sm text-white/60">

                <th className="p-4">Client</th>
                <th className="p-4">Entities</th>
                <th className="p-4">Open Periods</th>
                <th className="p-4">Pending Filings</th>
                <th className="p-4">Status</th>

              </tr>

            </thead>

            <tbody>

              {loading && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-white/60">
                    Loading...
                  </td>
                </tr>
              )}

              {!loading && clients.length===0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-white/60">
                    No accounting firm clients.
                  </td>
                </tr>
              )}

              {clients.map((c,i)=>(

                <tr
                  key={c.id||i}
                  className="border-t border-white/5"
                >

                  <td className="p-4">
                    {c.name||c.client_name||"-"}
                  </td>

                  <td className="p-4">
                    {c.entity_count||0}
                  </td>

                  <td className="p-4">
                    {c.open_periods||0}
                  </td>

                  <td className="p-4">
                    {c.pending_filings||0}
                  </td>

                  <td className="p-4">
                    {c.status||"Active"}
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
