"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";
import {
  calculateFOH,
  getPerformanceLevel,
} from "../../../lib/performance";

export default function AIOwner() {
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

  // 🔥 BASELINE
  const avgPastRevenue =
    history.length > 0
      ? history.reduce((sum, d) => sum + d.finalRevenue, 0) / history.length
      : 0;

  const projectedRevenue =
    avgPastRevenue > 0
      ? Math.round((avgPastRevenue + foh.revenue) / 2)
      : foh.revenue;

  // 🔥 OWNER DECISIONS
  const actions = [];

  if (foh.revenue < avgPastRevenue * 0.7) {
    actions.push({
      type: "CRITICAL",
      action: "Launch promotion immediately",
    });
  }

  if (foh.avg < 300) {
    actions.push({
      type: "STRATEGY",
      action: "Increase pricing or upsell items",
    });
  }

  if (performance.level === "BAD" || performance.level === "CRITICAL") {
    actions.push({
      type: "STAFF",
      action: "Reduce payout impact / review staff",
    });
  }

  if (projectedRevenue > avgPastRevenue * 1.2) {
    actions.push({
      type: "OPTIMIZE",
      action: "Increase staff efficiency / maximize profit",
    });
  }

  return (
    <AppShell>
      <div className="text-white space-y-6">

        <h1 className="text-3xl">AI Owner</h1>

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
          <div>Average: {Math.round(avgPastRevenue)}</div>
          <div>Projected: {projectedRevenue}</div>
        </div>

        {/* OWNER ACTIONS */}
        <div className="bg-white/5 p-6 rounded-xl space-y-3">
          <div className="text-sm text-white/50">Owner Decisions</div>

          {actions.length === 0 && (
            <div className="text-green-400">System stable</div>
          )}

          {actions.map((a, i) => (
            <div key={i} className="text-red-400">
              [{a.type}] {a.action}
            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}