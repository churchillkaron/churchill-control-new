"use client";

import { useEffect, useState } from "react";

export default function BalanceSheetPage() {

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    try {
      const res = await fetch("/api/finance/balance-sheet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tenant_id: "demo"
        })
      });

      const json = await res.json();

      setRows(json.data || []);

    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading balance sheet...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-4xl font-bold mb-6">
        Balance Sheet
      </h1>

      <div className="grid grid-cols-3 gap-6">

        <div className="p-6 bg-white/5 rounded-xl">
          <div className="text-white/50">Assets</div>
          <div className="text-2xl font-bold">
            {rows.assets || 0}
          </div>
        </div>

        <div className="p-6 bg-white/5 rounded-xl">
          <div className="text-white/50">Liabilities</div>
          <div className="text-2xl font-bold">
            {rows.liabilities || 0}
          </div>
        </div>

        <div className="p-6 bg-white/5 rounded-xl">
          <div className="text-white/50">Equity</div>
          <div className="text-2xl font-bold">
            {rows.equity || 0}
          </div>
        </div>

      </div>
    </div>
  );
}
