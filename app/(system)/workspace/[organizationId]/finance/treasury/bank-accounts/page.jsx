"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";

export default function BankAccountsPage() {

  const [accounts,setAccounts]=useState([]);
  const {
    financeGet,
    loading: runtimeLoading,
  } = useFinanceRuntime();

  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    if(!runtimeLoading){
      load();
    }
  },[runtimeLoading]);

  async function load(){

    try{

      setLoading(true);

      const json =
        await financeGet(
          "/api/finance/bank-accounts"
        );

      setAccounts(
        json.accounts ||
        json.bankAccounts ||
        json.data ||
        []
      );

    }catch{

      setAccounts([]);

    }finally{

      setLoading(false);

    }

  }

  const totals=useMemo(()=>({

    total:accounts.length,

    active:
      accounts.filter(a=>a.status==="ACTIVE").length,

    balance:
      accounts.reduce(
        (s,a)=>s+Number(a.balance||0),
        0
      )

  }),[accounts]);

  return(

    <main className="min-h-screen p-8 text-white">

      <div className="mx-auto max-w-7xl">

        <div className="flex items-center justify-between">

          <div>

            <div className="text-xs uppercase tracking-[0.35em] text-white/50">
              Finance / Treasury
            </div>

            <h1 className="mt-3 text-4xl font-light">
              Bank Accounts
            </h1>

            <p className="mt-2 text-white/60">
              Manage treasury bank accounts and reconciliation readiness.
            </p>

          </div>

          <button
            onClick={load}
            className="rounded-xl bg-blue-600 px-5 py-3"
          >
            Refresh
          </button>

        </div>

        <div className="mt-8 grid grid-cols-3 gap-4">

          <Card
            title="Accounts"
            value={totals.total}
          />

          <Card
            title="Active"
            value={totals.active}
          />

          <Card
            title="Combined Balance"
            value={totals.balance.toLocaleString()}
          />

        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">

          <table className="w-full">

            <thead className="border-b border-white/10">

              <tr className="text-left text-sm text-white/60">

                <th className="p-4">Bank</th>
                <th className="p-4">Account</th>
                <th className="p-4">Currency</th>
                <th className="p-4">Balance</th>
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

              {!loading && accounts.length===0 && (

                <tr>

                  <td
                    colSpan={5}
                    className="p-8 text-center text-white/60"
                  >
                    No bank accounts.
                  </td>

                </tr>

              )}

              {accounts.map((a,i)=>(

                <tr
                  key={a.id||i}
                  className="border-t border-white/5"
                >

                  <td className="p-4">
                    {a.bank_name||"-"}
                  </td>

                  <td className="p-4">
                    {a.account_number||"••••"}
                  </td>

                  <td className="p-4">
                    {a.currency_code||"THB"}
                  </td>

                  <td className="p-4">
                    {Number(a.balance||0).toLocaleString()}
                  </td>

                  <td className="p-4">
                    {a.status||"-"}
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
