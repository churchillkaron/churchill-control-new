import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";
"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

export default function ForecastPage() {

  const [forecast,setForecast]=useState({});
  const {
  organization,
  entity,
  period,
  loading: runtimeLoading,
} = useFinanceRuntime();

  const {
    financeGet,
    loading: runtimeLoading,
  } = useFinanceRuntime();

  const [loading,setLoading]=useState(true);

  useEffect(()=>{

    if(runtimeLoading){
      return;
    }
    load();
  },[runtimeLoading]);

  async function load(){

    try{

      setLoading(true);

      const res =
        await financeGet("/api/finance/forecast");

      const json =
        await res.json();

      setForecast(
        json.forecast ||
        json.data ||
        json ||
        {}
      );

    }catch{

      setForecast({});

    }finally{

      setLoading(false);

    }

  }

  const cards=useMemo(()=>[

    {
      title:"Revenue",
      value:Number(
        forecast.revenue||0
      ).toLocaleString()
    },

    {
      title:"Expenses",
      value:Number(
        forecast.expenses||0
      ).toLocaleString()
    },

    {
      title:"Cash Flow",
      value:Number(
        forecast.cashFlow||
        forecast.cash_flow||
        0
      ).toLocaleString()
    },

    {
      title:"Net Profit",
      value:Number(
        forecast.netProfit||
        forecast.net_profit||
        0
      ).toLocaleString()
    },

    {
      title:"Confidence",
      value:`${
        forecast.confidence||0
      }%`
    }

  ],[forecast]);

  return(

    <main className="min-h-screen p-8 text-white">

      <div className="mx-auto max-w-7xl">

        <div className="flex items-center justify-between">

          <div>

            <div className="text-xs uppercase tracking-[0.35em] text-white/50">
              Finance / Planning
            </div>

            <h1 className="mt-3 text-4xl font-light">
              Financial Forecast
            </h1>

            <p className="mt-2 text-white/60">
              Revenue, expenses, liquidity and profitability forecasting.
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
            Forecast Summary
          </h2>

          <p className="mt-3 text-white/60">
            {forecast.summary ||
             "Forecast generated from budgeting, historical ledger activity and cash-flow projections."}
          </p>

        </div>

      </div>

    </main>

  );

}
