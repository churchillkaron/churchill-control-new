"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [revenue, setRevenue] = useState(0);
  const [orders, setOrders] = useState([]);
  const [fohScore, setFohScore] = useState("—");
  const [serviceLevel, setServiceLevel] = useState(5);

  const loadData = () => {
    const ordersData = JSON.parse(localStorage.getItem("orders") || "[]");
    const historyDay = JSON.parse(localStorage.getItem("history_day") || "{}");
    const history = JSON.parse(localStorage.getItem("history") || "[]");

    setOrders(ordersData);
    setRevenue(historyDay.revenue || 0);

    // 🔥 TODAY FOH PERFORMANCE
    if (ordersData.length === 0) {
      setFohScore("—");
    } else {
      const totalRevenue = ordersData.reduce((sum, o) => sum + o.total, 0);
      const totalOrders = ordersData.length;
      const avgOrder = totalRevenue / totalOrders;

      let score = 50 + 30 + (avgOrder / 1000) * 20;

      let level = "GOOD";

      if (score < 40) level = "CRITICAL";
      else if (score < 60) level = "BAD";
      else if (score < 80) level = "WARNING";

      setFohScore(level);
    }

    // 🔥 REAL 30-DAY SYSTEM (UPDATED)
    const last30Days = history.slice(-30);

    if (last30Days.length === 0) {
      setServiceLevel(5);
      return;
    }

    const avgRevenue =
      last30Days.reduce((sum, d) => sum + (d.revenue || 0), 0) /
      last30Days.length;

    const avgOrders =
      last30Days.reduce(
        (sum, d) => sum + (d.paidOrders?.length || 0),
        0
      ) / last30Days.length;

    const avgOrderValue = avgRevenue / (avgOrders || 1);

    // 🔥 STRONGER LOGIC
    let level = 5;

    if (avgOrderValue > 600 && avgOrders > 100) {
      level = 7;
    } else if (avgOrderValue > 400 && avgOrders > 60) {
      level = 6;
    }

    setServiceLevel(level);
  };

  useEffect(() => {
    loadData();

    const handleStorageChange = () => loadData();
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const totalOrders = orders.length;
  const avgOrder =
    totalOrders > 0 ? Math.round(revenue / totalOrders) : 0;

  const serviceCharge = Math.round(revenue * (serviceLevel / 100));

  return (
    <AppShell>
      <div className="space-y-10">

        <div className="space-y-2">
          <h1 className="text-3xl font-medium text-white/90">
            Dashboard
          </h1>
          <p className="text-sm text-white/50">
            Real-time performance and control overview
          </p>
        </div>

        {/* HERO */}
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
              Service Charge ({serviceLevel}%): THB {serviceCharge.toLocaleString()}
            </div>

          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">

          <Card label="Orders" value={totalOrders} />
          <Card label="Avg Order" value={`THB ${avgOrder}`} />
          <Card label="FOH Score" value={fohScore} />
          <Card label="Service Level" value={`${serviceLevel}%`} />

        </div>

        {/* ALERTS */}
        <div className="space-y-4">

          <h2 className="text-white/60 text-sm uppercase tracking-wider">
            Alerts
          </h2>

          {serviceLevel === 5 && (
            <Alert text="Service locked at 5% (low performance)" />
          )}

          {serviceLevel === 6 && (
            <Alert text="Service unlocked to 6%" positive />
          )}

          {serviceLevel === 7 && (
            <Alert text="Max performance — 7%" positive />
          )}

        </div>

      </div>
    </AppShell>
  );
}

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