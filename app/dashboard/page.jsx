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
          stroke="var(--accent)"
          strokeWidth="2"
          points={points.join(" ")}
        />
      </svg>
    );
  }

  return (
    <div className="p-6">

      {/* ===== TITLE ===== */}
      <h1 className="text-2xl font-semibold mb-6">
        Dashboard
      </h1>

      {/* ===== KPI ROW ===== */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">

          <div className="p-4 rounded-xl border bg-[var(--bg-card)] border-[var(--border)]">
            <div className="text-sm text-[var(--text-secondary)]">Revenue</div>
            <div className="text-xl font-bold">
              THB {latest.revenue.toFixed(0)}
            </div>
          </div>

          <div className="p-4 rounded-xl border bg-[var(--bg-card)] border-[var(--border)]">
            <div className="text-sm text-[var(--text-secondary)]">Profit</div>
            <div className="text-xl font-bold">
              THB {latest.profit.toFixed(0)}
            </div>
          </div>

        </div>
      )}

      {/* ===== TREND ROW ===== */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">

        <div className="p-4 rounded-xl border bg-[var(--bg-card)] border-[var(--border)]">
          <div className="mb-3 font-medium">Revenue Trend</div>
          {renderLine(data.map(d => d.revenue))}

          <div className="flex justify-between text-xs text-[var(--text-secondary)] mt-2">
            {data.map((d, i) => (
              <span key={i}>{d.date}</span>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-[var(--bg-card)] border-[var(--border)]">
          <div className="mb-3 font-medium">Profit Trend</div>
          {renderLine(data.map(d => d.profit))}

          <div className="flex justify-between text-xs text-[var(--text-secondary)] mt-2">
            {data.map((d, i) => (
              <span key={i}>{d.date}</span>
            ))}
          </div>
        </div>

      </div>

      {/* ===== INSIGHT ===== */}
      <div className="p-5 rounded-xl border bg-[var(--bg-card)] border-[var(--border)]">
        <div className="font-medium mb-2">System Insight</div>

        <div className="text-[var(--text-secondary)]">
          {data.length > 1
            ? "System tracking revenue and profit trends. Add more operating days for stronger insights."
            : "Start saving days to activate analytics."}
        </div>
      </div>

    </div>
  );
}