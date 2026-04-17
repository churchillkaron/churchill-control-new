"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [revenue, setRevenue] = useState(0);
  const [orders, setOrders] = useState([]);
  const [fohScore, setFohScore] = useState("—");

  const loadData = () => {
    const ordersData = JSON.parse(localStorage.getItem("orders") || "[]");
    const historyDay = JSON.parse(localStorage.getItem("history_day") || "{}");

    setOrders(ordersData);
    setRevenue(historyDay.revenue || 0);

    // 🔥 FOH PERFORMANCE CALC
    if (ordersData.length === 0) {
      setFohScore("—");
      return;
    }

    const totalRevenue = ordersData.reduce((sum, o) => sum + o.total, 0);
    const totalOrders = ordersData.length;
    const avgOrder = totalRevenue / totalOrders;

    let score =
      (totalRevenue / (totalRevenue || 1)) * 50 +
      (totalOrders / (totalOrders || 1)) * 30 +
      (avgOrder / 1000) * 20;

    let level = "GOOD";

    if (score < 40) level = "CRITICAL";
    else if (score < 60) level = "BAD";
    else if (score < 80) level = "WARNING";

    setFohScore(level);
  };

  useEffect(() => {
    loadData();

    // 🔥 REAL-TIME SYNC
    const handleStorageChange = () => {
      loadData();
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const totalOrders = orders.length;
  const avgOrder =
    totalOrders > 0
      ? Math.round(revenue / totalOrders)
      : 0;

  const serviceCharge = Math.round(revenue * 0.05);

  return (
    <AppShell>
      <div className="space-y-10">

        {/* HEADER */}
        <div className="space-y-2">
          <h1 className="text-3xl font-medium text-white/90">
            Dashboard
          </h1>
          <p className="text-sm text-white/50">
            Real-time performance and control overview
          </p>
        </div>

        {/* 🔥 HERO REVENUE CARD */}
        <div className="relative">
          <div className="absolute -inset-6 rounded-[32px] bg-[#ff7a00]/10 blur-3xl" />

          <div className="relative rounded-[28px] border border-white/10 bg-white/[0.06] p-10 backdrop-blur-xl shadow-[0_30px_80px_rgba(0,0,0,0.6)]">

            <div className="mb-3 text-sm text-white/50">
              Today Revenue
            </div>

            <div className="text-6xl font-semibold tracking-tight">
              THB {revenue.toLocaleString()}
            </div>

            <div className="mt-3 text-sm text-white/40">
              Service Charge: THB {serviceCharge.toLocaleString()}
            </div>

          </div>
        </div>

        {/* 🔥 KPI STRIP */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">

          <Card label="Orders" value={totalOrders} />
          <Card label="Avg Order" value={`THB ${avgOrder}`} />
          <Card label="FOH Score" value={fohScore} />
          <Card label="Service Charge" value={`THB ${serviceCharge}`} />

        </div>

        {/* 🔥 ALERTS (CONTROL LAYER) */}
        <div className="space-y-4">

          <h2 className="text-white/60 text-sm uppercase tracking-wider">
            Alerts
          </h2>

          {totalOrders === 0 && (
            <Alert text="No orders yet today" />
          )}

          {avgOrder < 300 && totalOrders > 5 && (
            <Alert text="Low average order value" />
          )}

          {fohScore === "CRITICAL" && (
            <Alert text="FOH performance critical" />
          )}

          {fohScore === "BAD" && (
            <Alert text="FOH performance needs attention" />
          )}

          {revenue > 0 && totalOrders > 0 && avgOrder >= 300 && fohScore === "GOOD" && (
            <Alert text="System running well" positive />
          )}

        </div>

      </div>
    </AppShell>
  );
}

/* 🔥 COMPONENTS */

function Card({ label, value }) {
  return (
    <div className="relative">
      <div className="absolute -inset-2 rounded-[20px] bg-white/5 blur-xl" />
      <div className="relative rounded-[20px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        <div className="mb-1 text-xs text-white/50">{label}</div>
        <div className="text-xl font-medium">{value}</div>
      </div>
    </div>
  );
}

function Alert({ text, positive }) {
  return (
    <div
      className={`rounded-xl px-4 py-3 text-sm ${
        positive
          ? "bg-green-500/10 text-green-300"
          : "bg-[#ff7a00]/10 text-[#ffb36b]"
      }`}
    >
      {text}
    </div>
  );
}