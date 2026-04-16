"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [data, setData] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/history");
        const json = await res.json();

        const mapped = json.slice(0, 7).map((day) => {
          const rows = day.dishes?.rows || [];

          let revenue = 0;
          let cost = 0;

          rows.forEach((d) => {
            revenue += d.revenue || 0;
            cost += d.cogs || 0;
          });

          return {
            date: new Date(day.date).toLocaleDateString(),
            revenue,
            profit: revenue - cost,
          };
        });

        setData(mapped.reverse());
      } catch {}
    }

    load();
  }, []);

  const latest = data[data.length - 1];

  function renderLine(values) {
    if (!values.length) return null;

    const max = Math.max(...values, 1);

    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 100 - (v / max) * 100;
      return `${x},${y}`;
    });

    return (
      <svg viewBox="0 0 100 100" className="w-full h-24">
        <polyline
          fill="none"
          stroke="#ff7a00"
          strokeWidth="2"
          points={points.join(" ")}
        />
      </svg>
    );
  }

  return (
    <div className="min-h-screen bg-[#e6dcc7] p-6">

      {/* TITLE */}
      <h1 className="text-2xl font-semibold mb-6 text-[#2f2a24]">
        Dashboard
      </h1>

      {/* KPI */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">

          <div className="p-4 rounded-xl border bg-[#d2c6a8] border-[#9f9478] shadow-sm">
            <div className="text-sm text-[#6b6458]">Revenue</div>
            <div className="text-xl font-bold text-[#2f2a24]">
              THB {latest.revenue.toFixed(0)}
            </div>
          </div>

          <div className="p-4 rounded-xl border bg-[#d2c6a8] border-[#9f9478] shadow-sm">
            <div className="text-sm text-[#6b6458]">Profit</div>
            <div className="text-xl font-bold text-[#2f2a24]">
              THB {latest.profit.toFixed(0)}
            </div>
          </div>

        </div>
      )}

      {/* TRENDS */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">

        <div className="p-4 rounded-xl border bg-[#d2c6a8] border-[#9f9478] shadow-sm">
          <div className="mb-3 font-medium text-[#2f2a24]">
            Revenue Trend
          </div>

          {renderLine(data.map(d => d.revenue))}

          <div className="flex justify-between text-xs text-[#6b6458] mt-2">
            {data.map((d, i) => (
              <span key={i}>{d.date}</span>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-[#d2c6a8] border-[#9f9478] shadow-sm">
          <div className="mb-3 font-medium text-[#2f2a24]">
            Profit Trend
          </div>

          {renderLine(data.map(d => d.profit))}

          <div className="flex justify-between text-xs text-[#6b6458] mt-2">
            {data.map((d, i) => (
              <span key={i}>{d.date}</span>
            ))}
          </div>
        </div>

      </div>

      {/* INSIGHT */}
      <div className="p-5 rounded-xl border bg-[#d2c6a8] border-[#9f9478] shadow-sm">
        <div className="font-medium mb-2 text-[#2f2a24]">
          System Insight
        </div>

        <div className="text-[#6b6458]">
          {data.length > 1
            ? "System tracking revenue and profit trends."
            : "Start saving days to activate analytics."}
        </div>
      </div>

    </div>
  );
}