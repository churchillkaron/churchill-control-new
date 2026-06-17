"use client";

import { useEffect, useState } from "react";

export default function ProfitLossPage() {

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    try {
      const res = await fetch("/api/finance/profit-loss", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tenant_id: "demo"
        })
      });

      const json = await res.json();

      setData(json.data || null);

    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading profit & loss...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-4xl font-bold mb-6">
        Profit & Loss
      </h1>

      <div className="grid grid-cols-3 gap-6">

        <div className="p-6 bg-white/5 rounded-xl">
          <div className="text-white/50">Revenue</div>
          <div className="text-2xl font-bold">
            {data?.revenue || 0}
          </div>
        </div>

        <div className="p-6 bg-white/5 rounded-xl">
          <div className="text-white/50">Expenses</div>
          <div className="text-2xl font-bold">
            {data?.expenses || 0}
          </div>
        </div>

        <div className="p-6 bg-white/5 rounded-xl">
          <div className="text-white/50">Profit</div>
          <div className="text-2xl font-bold">
            {data?.profit || 0}
          </div>
        </div>

      </div>

    </div>
  );
}
