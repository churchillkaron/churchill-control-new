"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

export default function CashflowPage() {

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCashflow();
  }, []);

  async function fetchCashflow() {
    setLoading(true);

    try {
      const res = await fetch("/api/finance/cashflow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_id: "demo" // TODO: replace with real tenant resolver later
        }),
      });

      const json = await res.json();

      setRows(json.data || []);
    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  }

  const totals = useMemo(() => {

    const inflow = rows.reduce(
      (sum, row) => sum + Number(row.total_debits || 0),
      0
    );

    const outflow = rows.reduce(
      (sum, row) => sum + Number(row.total_credits || 0),
      0
    );

    return {
      inflow,
      outflow,
      netCashflow: inflow - outflow,
    };

  }, [rows]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading cashflow...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <div className="mb-10">
        <h1 className="text-4xl font-bold">Cashflow Statement</h1>
        <div className="text-white/50 mt-2">
          Enterprise liquidity monitoring
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-10">
        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
          Cash Inflow: {totals.inflow}
        </div>

        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
          Cash Outflow: {totals.outflow}
        </div>

        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
          Net: {totals.netCashflow}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">

        <div className="grid grid-cols-6 gap-4 px-6 py-4 border-b border-white/10 text-white/50 text-sm">
          <div>Date</div>
          <div>Code</div>
          <div>Account</div>
          <div className="text-right">Inflow</div>
          <div className="text-right">Outflow</div>
          <div className="text-right">Net</div>
        </div>

        {rows.length === 0 && (
          <div className="p-6 text-white/40">
            No cashflow data
          </div>
        )}

        {rows.map((row, index) => (
          <div
            key={index}
            className="grid grid-cols-6 gap-4 px-6 py-4 border-b border-white/10 text-sm"
          >
            <div>{row.entry_date}</div>
            <div>{row.code}</div>
            <div>{row.name}</div>

            <div className="text-right">
              {row.total_debits}
            </div>

            <div className="text-right">
              {row.total_credits}
            </div>

            <div className="text-right">
              {row.net_cashflow}
            </div>
          </div>
        ))}

      </div>
    </div>
  );
}
