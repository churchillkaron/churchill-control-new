"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";
import {
  calculateFOH,
  getPerformanceLevel,
} from "../../../lib/performance";

export default function AIManager() {
  const [orders, setOrders] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      loadAll();
    }

    const interval = setInterval(() => {
      if (typeof window !== "undefined") {
        loadAll();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const loadAll = () => {
    const storedOrders = JSON.parse(localStorage.getItem("orders") || "[]");
    const storedHistory = JSON.parse(localStorage.getItem("history") || "[]");

    setOrders(storedOrders);
    setHistory(storedHistory);
  };

  const foh = calculateFOH(orders);
  const performance = getPerformanceLevel(foh.score);

  // 🔥 PREDICTION ENGINE
  const avgPastRevenue =
    history.length > 0
      ? history.reduce((sum, d) => sum + d.finalRevenue, 0) / history.length
      : 0;

  const projectedRevenue =
    avgPastRevenue > 0
      ? Math.round((avgPastRevenue + foh.revenue) / 2)
      : foh.revenue;

  // 🔥 DECISIONS
  const decisions = [];

  if (foh.revenue < avgPastRevenue * 0.7) {
    decisions.push("⚠️ Revenue below normal — take action now");
  }

  if (foh.avg < 300) {
    decisions.push("📈 Increase average order value (upsell strategy)");
  }

  if (performance.level === "BAD" || performance.level === "CRITICAL") {
    decisions.push("👥 Staff performance risk — supervise team");
  }

  if (projectedRevenue < avgPastRevenue) {
    decisions.push("🔮 Today likely underperforming vs average");
  } else {
    decisions.push("✅ On track or exceeding normal performance");
  }

  return (
    <AppShell>
      <div className="text-white space-y-6">

        <h1 className="text-3xl">AI Manager</h1>

        {/* LIVE */}
        <div className="bg-white/5 p-6 rounded-xl space-y-2">
          <div className="text-sm text-white/50">Live</div>
          <div>Revenue: {foh.revenue}</div>
          <div>Orders: {foh.orderCount}</div>
          <div>Avg: {foh.avg}</div>
          <div>Performance: {performance.level}</div>
        </div>

        {/* PREDICTION */}
        <div className="bg-white/5 p-6 rounded-xl space-y-2">
          <div className="text-sm text-white/50">Prediction</div>
          <div>Average Past Revenue: {Math.round(avgPastRevenue)}</div>
          <div>Projected Today: {projectedRevenue}</div>
        </div>

        {/* DECISIONS */}
        <div className="bg-white/5 p-6 rounded-xl space-y-2">
          <div className="text-sm text-white/50">AI Decisions</div>

          {decisions.map((d, i) => (
            <div key={i} className="text-green-400">
              • {d}
            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}