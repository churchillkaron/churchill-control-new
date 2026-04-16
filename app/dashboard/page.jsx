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

          const revenue = rows.reduce((sum, d) => {
            return sum + (d.revenue || 0);
          }, 0);

          return {
            date: new Date(day.date).toLocaleDateString(),
            revenue,
          };
        });

        setData(mapped.reverse());
      } catch (e) {
        console.log("Trend load error", e);
      }
    }

    load();
  }, []);

  // SVG line chart
  function renderChart() {
    if (!data.length) return null;

    const max = Math.max(...data.map((d) => d.revenue), 1);

    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - (d.revenue / max) * 100;
      return `${x},${y}`;
    });

    return (
      <svg viewBox="0 0 100 100" className="w-full h-40">
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
    <div className="min-h-screen p-6">
      <h1 className="text-2xl mb-6">Dashboard</h1>

      {/* TREND CARD */}
      <div className="rounded-2xl border border-[#d6ccb5] bg-[#f5f1e8] p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2 text-[#2f2a24]">
          Revenue Trend (Last 7 Days)
        </h2>

        {renderChart()}

        <div className="flex justify-between text-xs text-[#6b6458] mt-2">
          {data.map((d, i) => (
            <span key={i}>{d.date}</span>
          ))}
        </div>
      </div>

      {/* EXISTING DASHBOARD BELOW */}
      <div className="text-[#2f2a24]">
        (Your existing KPI cards stay here)
      </div>
    </div>
  );
}