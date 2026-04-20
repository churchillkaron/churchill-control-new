"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";
import {
  calculateFOH,
  getPerformanceLevel,
} from "../../../lib/performance";

export default function AIManager() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      loadOrders();
    }

    const interval = setInterval(() => {
      if (typeof window !== "undefined") {
        loadOrders();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const loadOrders = () => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");
    setOrders(stored);
  };

  const foh = calculateFOH(orders);
  const performance = getPerformanceLevel(foh.score);

  // 🔥 DECISION ENGINE
  const decisions = [];

  if (foh.orderCount < 5) {
    decisions.push("Increase traffic: run promotion or attract guests");
  }

  if (performance.level === "BAD" || performance.level === "CRITICAL") {
    decisions.push("Staff performance low: monitor team closely");
  }

  if (foh.avg < 300) {
    decisions.push("Upsell needed: increase average order value");
  }

  if (foh.revenue > 20000) {
    decisions.push("High revenue: maintain current strategy");
  }

  return (
    <AppShell>
      <div className="text-white space-y-6">

        <h1 className="text-3xl">AI Manager</h1>

        <div className="bg-white/5 p-6 rounded-xl space-y-3">
          <div className="text-sm text-white/50">Live Analysis</div>

          <div>Revenue: {foh.revenue}</div>
          <div>Orders: {foh.orderCount}</div>
          <div>Avg: {foh.avg}</div>
          <div>Performance: {performance.level}</div>
        </div>

        <div className="bg-white/5 p-6 rounded-xl space-y-3">
          <div className="text-sm text-white/50">AI Decisions</div>

          {decisions.length === 0 && (
            <div className="text-white/40">No action needed</div>
          )}

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