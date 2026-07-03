"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";

export default function TreasuryPage() {

  const {
    financeGet,
    loading: runtimeLoading,
  } = useFinanceRuntime();

  const [liquidity,setLiquidity] = useState({});
  const [payments,setPayments] = useState([]);
  const [loading,setLoading] = useState(true);

  useEffect(()=>{
    if(!runtimeLoading){
      load();
    }
  },[runtimeLoading]);

  async function load(){

    try{

      setLoading(true);

      const [l,p] = await Promise.all([
        financeGet("/api/finance/treasury/liquidity"),
        financeGet("/api/finance/payments/list")
      ]);

      const liquidityJson = l;
      const paymentJson = p;

      setLiquidity(
        liquidityJson.data ||
        liquidityJson ||
        {}
      );

      setPayments(
        paymentJson.payments ||
        paymentJson.data ||
        []
      );

    }catch{

      setLiquidity({});
      setPayments([]);

    }finally{

      setLoading(false);

    }

  }

  const totals = useMemo(()=>({

    queued:
      payments.filter(x=>x.status==="PENDING").length,

    approved:
      payments.filter(x=>x.status==="APPROVED").length,

    paid:
      payments.filter(x=>x.status==="PAID").length,

    amount:
      payments.reduce(
        (s,p)=>s+Number(p.amount||0),
        0
      )

  }),[payments]);

  return (

    <main className="min-h-screen p-8 text-white">

      <div className="mx-auto max-w-7xl">

        <div className="flex items-center justify-between">

          <div>

            <div className="text-xs uppercase tracking-[0.35em] text-white/50">
              Finance / Treasury
            </div>

            <h1 className="mt-3 text-4xl font-light">
              Treasury
            </h1>

            <p className="mt-2 text-white/60">
              Liquidity, cash position, banking and payment management.
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

          <Card
            title="Available Liquidity"
            value={Number(
              liquidity.available ||
              liquidity.available_liquidity ||
              0
            ).toLocaleString()}
          />

          <Card
            title="Queued Payments"
            value={totals.queued}
          />

          <Card
            title="Paid Today"
            value={totals.paid}
          />

          <Card
            title="Payment Value"
            value={totals.amount.toLocaleString()}
          />

        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">

          <table className="w-full">

            <thead className="border-b border-white/10">

              <tr className="text-left text-sm text-white/60">

                <th className="p-4">
                  Vendor
                </th>

                <th className="p-4">
                  Amount
                </th>

                <th className="p-4">
                  Due
                </th>

                <th className="p-4">
                  Status
                </th>

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

              {!loading &&
               payments.length===0 && (

                <tr>

                  <td
                    colSpan={4}
                    className="p-8 text-center text-white/60"
                  >
                    No treasury activity.
                  </td>

                </tr>

              )}

              {payments.map((p,i)=>(

                <tr
                  key={p.id||i}
                  className="border-t border-white/5"
                >

                  <td className="p-4">
                    {p.vendor_name||
                     p.vendor||
                     "-"}
                  </td>

                  <td className="p-4">
                    {Number(
                      p.amount||0
                    ).toLocaleString()}
                  </td>

                  <td className="p-4">
                    {p.due_date||"-"}
                  </td>

                  <td className="p-4">
                    {p.status||"-"}
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

function Card({
  title,
  value,
}){

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
