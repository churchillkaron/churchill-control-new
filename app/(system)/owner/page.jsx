"use client";

import { useEffect, useState } from "react";

export default function OwnerDashboard() {
  const [data, setData] = useState(null);

  const load = async () => {
    const res = await fetch("/api/owner");
    const result = await res.json();

    setData(result);
  };

  useEffect(() => {
    load();
  }, []);

  if (!data) {
    return (
      <div className="p-6 text-white">
        Loading owner dashboard...
      </div>
    );
  }

  return (
    <div className="p-6 text-white max-w-6xl mx-auto space-y-6">
      <h1 className="text-3xl font-semibold">Owner Dashboard</h1>

      {/* 💰 CORE NUMBERS */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/5 p-4 rounded-xl">
          <div className="text-white/50">Revenue</div>
          <div className="text-xl">฿{data.revenue.toFixed(0)}</div>
        </div>

        <div className="bg-white/5 p-4 rounded-xl">
          <div className="text-white/50">Cost</div>
          <div className="text-xl text-red-400">
            ฿{data.cost.toFixed(0)}
          </div>
        </div>

        <div className="bg-white/5 p-4 rounded-xl">
          <div className="text-white/50">Profit</div>
          <div className="text-xl text-green-400">
            ฿{data.profit.toFixed(0)}
          </div>
        </div>
      </div>

      {/* 🔝 TOP DISHES */}
      <div className="bg-white/5 p-4 rounded-xl">
        <div className="mb-3 font-semibold">Top Dishes</div>

        {data.top.map((d, i) => (
          <div key={i} className="flex justify-between text-sm mb-1">
            <span>{d.name}</span>
            <span>฿{d.revenue.toFixed(0)}</span>
          </div>
        ))}
      </div>

      {/* ⚠ WORST DISHES */}
      <div className="bg-white/5 p-4 rounded-xl">
        <div className="mb-3 font-semibold">Worst Dishes</div>

        {data.worst.map((d, i) => (
          <div key={i} className="flex justify-between text-sm mb-1 text-red-400">
            <span>{d.name}</span>
            <span>฿{d.revenue.toFixed(0)}</span>
          </div>
        ))}
      </div>

      {/* 📦 STOCK PROBLEMS */}
      <div className="bg-white/5 p-4 rounded-xl">
        <div className="mb-3 font-semibold">Stock Issues</div>

        {data.lowStock.length === 0 && (
          <div className="text-white/50">No issues</div>
        )}

        {data.lowStock.map((d, i) => (
          <div key={i} className="text-yellow-400 text-sm">
            {d.name} (Stock: {d.quantity})
          </div>
        ))}
      </div>
    </div>
  );
}