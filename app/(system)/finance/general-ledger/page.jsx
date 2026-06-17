"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function GeneralLedgerPage() {

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    try {
      const res = await fetch("/api/finance/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tenant_id: "demo"
        })
      });

      const json = await res.json();

      setRows(json.data?.generalLedger || []);

    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading general ledger...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-4xl font-bold mb-6">
        General Ledger
      </h1>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">

        <div className="grid grid-cols-5 gap-4 px-6 py-4 border-b border-white/10 text-white/50 text-sm">
          <div>Date</div>
          <div>Account</div>
          <div>Description</div>
          <div className="text-right">Debit</div>
          <div className="text-right">Credit</div>
        </div>

        {rows.length === 0 && (
          <div className="p-6 text-white/40">
            No ledger entries
          </div>
        )}

        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-5 gap-4 px-6 py-4 border-b border-white/10 text-sm"
          >
            <div>{row.entry_date}</div>
            <div>{row.account_name || row.account}</div>
            <div>{row.description}</div>
            <div className="text-right">{row.debit}</div>
            <div className="text-right">{row.credit}</div>
          </div>
        ))}

      </div>
    </div>
  );
}
