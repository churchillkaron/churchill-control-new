"use client";

import { useEffect, useState } from "react";
import AppShell from '@/app/AppShell'
import {
  calculateFOH,
  getPerformanceLevel,
} from "@/lib/performance.js";

function saveInsight(insight) {
  const memory = JSON.parse(localStorage.getItem("ai_memory") || "[]");

  memory.push({
    id: Date.now(),
    insight,
    created_at: new Date().toISOString(),
  });

  localStorage.setItem("ai_memory", JSON.stringify(memory));
}

function getInsights() {
  return JSON.parse(localStorage.getItem("ai_memory") || "[]");
}

export default function AIOwner() {
  const [orders, setOrders] = useState([]);
  const [history, setHistory] = useState([]);
  const [actions, setActions] = useState([]);
  const [aiResult, setAiResult] = useState("");
  const [insights, setInsights] = useState([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      loadAll();
      setInsights(getInsights());
    }

    const interval = setInterval(() => {
      if (typeof window !== "undefined") {
        loadAll();
      }
    }, 2000);

    // 🔥 AUTO AI LOOP (every 30 sec)
    const aiInterval = setInterval(() => {
      if (typeof window !== "undefined") {
        runAI();
      }
    }, 30000);

    return () => {
      clearInterval(interval);
      clearInterval(aiInterval);
    };
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
      newActions.push("Auto: Promotion triggered");
      localStorage.setItem("auto_promo", "active");
    }

    if (performance.level === "CRITICAL") {
      newActions.push("Auto: Staff penalty mode activated");
      localStorage.setItem("auto_staff_mode", "strict");
    }

    if (foh.avg < 300) {
      newActions.push("Auto: Upsell mode activated");
      localStorage.setItem("auto_upsell", "active");
    }

    setActions(newActions);
  }, [foh.revenue, foh.avg, performance.level, avgPastRevenue]);

  // 🔥 REAL AI (AUTO)
  const runAI = async () => {
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          revenue: foh.revenue,
          orders: foh.orderCount,
          avg: foh.avg,
          performance: performance.level,
        }),
      });

      const data = await res.json();

      setAiResult(data.result);

      saveInsight(data.result);
      setInsights(getInsights());
    } catch (err) {
      console.error("AI error:", err);
    }
  };

  return (
    <AppShell>
      <div className="text-white space-y-6">

        <h1 className="text-3xl">AI Owner (Auto)</h1>

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
              {a}
            </div>
          ))}
        </div>

        {/* AI OUTPUT */}
        {aiResult && (
          <div className="bg-white/5 p-4 rounded whitespace-pre-line">
            {aiResult}
          </div>
        )}

        {/* MEMORY */}
        {insights.length > 0 && (
          <div className="bg-white/5 p-4 rounded space-y-2">
            <div className="text-sm text-white/50">AI Memory</div>

            {insights.slice().reverse().map((i) => (
              <div key={i.id} className="text-white/70 text-sm">
                {i.insight}
              </div>
            ))}
          </div>
        )}

      </div>
    </AppShell>
  );
}