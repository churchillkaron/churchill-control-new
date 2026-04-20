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
  const [actions, setActions] = useState([]);

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

  const avgPastRevenue =
    history.length > 0
      ? history.reduce((sum, d) => sum + d.finalRevenue, 0) / history.length
      : 0;

  const projectedRevenue =
    avgPastRevenue > 0
      ? Math.round((avgPastRevenue + foh.revenue) / 2)
      : foh.revenue;

  // 🔥 AUTO ACTION ENGINE
  useEffect(() => {
    const newActions = [];

    if (foh.revenue < avgPastRevenue * 0.7) {
      newActions.push({
        type: "PROMOTION",
        message: "Auto: Promotion triggered",
      });

      localStorage.setItem("auto_promo", "active");
    }

    if (performance.level === "CRITICAL") {
      newActions.push({
        type: "STAFF",
        message: "Auto: Staff penalty mode activated",
      });

      localStorage.setItem("auto_staff_mode", "strict");
    }

    if (foh.avg < 300) {
      newActions.push({
        type: "PRICING",
        message: "Auto: Upsell mode activated",
      });

      localStorage.setItem("auto_upsell", "active");
    }

    setActions(newActions);
  }, [foh.revenue, foh.avg, performance.level]);

  return (
    <AppShell>
      <div className="text-white space-y-6">

        <h1 className="text-3xl">AI Owner (Auto Mode)</h1>

        {/* LIVE */}
        <div className="bg-white/5 p-6 rounded-xl space-y-2">
          <div>Revenue: {foh.revenue}</div>
          <div>Orders: {foh.orderCount}</div>
          <div>Avg: {foh.avg}</div>
          <div>Performance: {performance.level}</div>
        </div>

        {/* PREDICTION */}
        <div className="bg-white/5 p-6 rounded-xl space-y-2">
          <div>Average: {Math.round(avgPastRevenue)}</div>
          <div>Projected: {projectedRevenue}</div>
        </div>

        {/* AUTO ACTIONS */}
        <div className="bg-white/5 p-6 rounded-xl space-y-3">
          <div className="text-sm text-white/50">Auto Actions</div>

          {actions.length === 0 && (
            <div className="text-green-400">No intervention needed</div>
          )}

          {actions.map((a, i) => (
            <div key={i} className="text-red-400">
              {a.message}
            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}