"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function CashflowPage() {

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCashflow();
  }, []);

  async function fetchCashflow() {

    setLoading(true);

    const { data, error } =
      await supabase
        .from("cashflow_view")
        .select("*")
        .order("entry_date", {
          ascending: true,
        });

    if (error) {

      console.error(error);
      alert(error.message);

    }

    setRows(data || []);

    setLoading(false);

  }

  // -----------------------------------
  // TOTALS
  // -----------------------------------

  const totals = useMemo(() => {

    const inflow =
      rows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.total_debits || 0
          ),
        0
      );

    const outflow =
      rows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.total_credits || 0
          ),
        0
      );

    const netCashflow =
      inflow - outflow;

    return {

      inflow,

      outflow,

      netCashflow,

    };

  }, [rows]);

  // -----------------------------------
  // UI
  // -----------------------------------

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading cashflow...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Cashflow Statement
        </h1>

        <div className="text-white/50 mt-2">
          Enterprise liquidity monitoring
        </div>

      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-3 gap-4 mb-10">

        <SummaryCard
          title="Cash Inflow"
          value={totals.inflow}
        />

        <SummaryCard
          title="Cash Outflow"
          value={totals.outflow}
        />

        <SummaryCard
          title="Net Cashflow"
          value={totals.netCashflow}
          highlight={
            totals.netCashflow >= 0
          }
          danger={
            totals.netCashflow < 0
          }
        />

      </div>

      {/* TABLE */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">

        <div className="grid grid-cols-6 gap-4 px-6 py-4 border-b border-white/10 text-white/50 text-sm">

          <div>Date</div>

          <div>Code</div>

          <div>Account</div>

          <div className="text-right">
            Inflow
          </div>

          <div className="text-right">
            Outflow
          </div>

          <div className="text-right">
            Net
          </div>

        </div>

        {rows.length === 0 && (

          <div className="p-6 text-white/40">
            No cashflow data
          </div>

        )}

        {rows.map((row, index) => (

          <div
            key={`${row.entry_date}-${index}`}
            className="grid grid-cols-6 gap-4 px-6 py-4 border-b border-white/10 text-sm"
          >

            <div>
              {row.entry_date}
            </div>

            <div>
              {row.code}
            </div>

            <div>
              {row.name}
            </div>

            <div className="text-right">

              ฿{Number(
                row.total_debits || 0
              ).toLocaleString()}

            </div>

            <div className="text-right">

              ฿{Number(
                row.total_credits || 0
              ).toLocaleString()}

            </div>

            <div className="text-right">

              ฿{Number(
                row.net_cashflow || 0
              ).toLocaleString()}

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}

// -----------------------------------
// SUMMARY CARD
// -----------------------------------

function SummaryCard({
  title,
  value,
  highlight = false,
  danger = false,
}) {

  return (

    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">

      <div className="text-white/50 text-sm">
        {title}
      </div>

      <div
        className={`text-3xl font-bold mt-2 ${
          danger
            ? "text-red-400"
            : highlight
            ? "text-green-400"
            : "text-white"
        }`}
      >

        ฿{Number(
          value || 0
        ).toLocaleString()}

      </div>

    </div>

  );

}