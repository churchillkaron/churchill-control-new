"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";

export default function InvoiceMatchingPage() {

  const {
    financeGet,
    loading: runtimeLoading,
  } = useFinanceRuntime();

  const [rows,setRows] = useState([]);
  const [loading,setLoading] = useState(true);

  useEffect(()=>{

    if(runtimeLoading){
      return;
    }

    load();

  },[runtimeLoading]);

  async function load(){

    try{

      setLoading(true);

      const json =
        await financeGet(
          "/api/finance/invoice-matching/runtime"
        );

      setRows(
        json.matches ||
        json.data ||
        []
      );

    }catch{

      setRows([]);

    }finally{

      setLoading(false);

    }

  }

  const stats = useMemo(()=>({

    waiting:
      rows.filter(r=>r.status==="WAITING").length,

    matched:
      rows.filter(r=>r.status==="MATCHED").length,

    exceptions:
      rows.filter(r=>r.status==="EXCEPTION").length,

    posted:
      rows.filter(r=>r.status==="POSTED").length,

  }),[rows]);

  return (

    <main className="min-h-screen p-8 text-white">

      <div className="mx-auto max-w-7xl">

        <div className="flex items-center justify-between">

          <div>

            <div className="text-xs uppercase tracking-[0.35em] text-white/50">
              Finance / Procure to Pay
            </div>

            <h1 className="mt-3 text-4xl font-light">
              Invoice Matching
            </h1>

            <p className="mt-2 text-white/60">
              Two-way and three-way procurement matching.
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

          <Card title="Waiting" value={stats.waiting}/>
          <Card title="Matched" value={stats.matched}/>
          <Card title="Exceptions" value={stats.exceptions}/>
          <Card title="Posted" value={stats.posted}/>

        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">

          <table className="w-full">

            <thead className="border-b border-white/10">

              <tr className="text-left text-sm text-white/60">

                <th className="p-4">Vendor</th>
                <th className="p-4">Invoice</th>
                <th className="p-4">PO</th>
                <th className="p-4">Receipt</th>
                <th className="p-4">Confidence</th>
                <th className="p-4">Variance</th>
                <th className="p-4">Status</th>

              </tr>

            </thead>

            <tbody>

              {loading && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-white/60">
                    Loading...
                  </td>
                </tr>
              )}

              {!loading && rows.length===0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-white/60">
                    No invoice matches.
                  </td>
                </tr>
              )}

              {rows.map((r,i)=>(

                <tr
                  key={r.id||i}
                  className="border-t border-white/5"
                >

                  <td className="p-4">
                    {r.vendor_name||"-"}
                  </td>

                  <td className="p-4">
                    {r.invoice_number||"-"}
                  </td>

                  <td className="p-4">
                    {r.purchase_order_number||"-"}
                  </td>

                  <td className="p-4">
                    {r.goods_receipt_number||"-"}
                  </td>

                  <td className="p-4">
                    {r.confidence||0}%
                  </td>

                  <td className="p-4">
                    {r.variance||0}
                  </td>

                  <td className="p-4">
                    {r.status}
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
