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
  const [aiResult, setAiResult] = useState("");

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
  }, [foh.revenue, foh.avg, performance.level]);

  // 🔥 REAL AI CALL
  const runAI = async () => {
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
  };

  return (
    <AppShell>
      <div className="text-white space-y-6">

        <h1 className="text-3xl">AI Owner</h1>

        {/* LIVE */}
        <div className="bg-white/5 p-6 rounded-xl space-y-2">
          <div>Revenue: {foh.revenue}</div>
          <div>Orders: {foh.orderCount}</div>
          <div>Avg: {foh.avg}</div>
          <div>Performance: {performance.level}</div>
        </div>

        {/* PREDICTION */}
        <div className="bg