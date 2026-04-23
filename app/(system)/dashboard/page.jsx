"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function DashboardPage() {
  const [revenue, setRevenue] = useState(0);
  const [orders, setOrders] = useState(0);
  const [avg, setAvg] = useState(0);
  const [performance, setPerformance] = useState(0);

  const [revTrend, setRevTrend] = useState(0);
  const [orderTrend, setOrderTrend] = useState(0);

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem("history") || "[]");

    const today = history[history.length - 1] || {};
    const yesterday = history[history.length - 2] || {};

    setRevenue(today.revenue || 0);
    setOrders(today.totalOrders || 0);
    setAvg(today.avgOrderValue || 0);

    // 🔥 TREND CALCULATION
    const revDiff = (today.revenue || 0) - (yesterday.revenue || 0);
    const orderDiff =
      (today.totalOrders || 0) - (yesterday.totalOrders || 0);

    setRevTrend(revDiff);
    setOrderTrend(orderDiff);

    fetchPerformance();
  }, []);

  const fetchPerformance = async () => {
    try {
      const res = await fetch("/api/performance/list");
      const result = await res.json();

      if (result.success && result.data.length > 0) {
        const avgScore = Math.round(
          result.data.reduce((sum, d) => sum + d.score, 0) /
            result.data.length
        );
        setPerformance(avgScore);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getStatus = () => {
    if (performance >= 90) return { label: "GOOD", color: "text-green-400" };
    if (performance >= 70) return { label: "WARNING", color: "text-yellow-400" };
    return { label: "BAD", color: "text-red-400" };
  };

  const status = getStatus();

  const alerts = [];

  if (revenue < 5000) alerts.push("⚠ Low revenue today");
  if (performance < 70) alerts.push("⚠ Staff performance is low");
  if (avg < 300) alerts.push("⚠ Low average order value");

  const cards = [
    { name: "POS", href: "/pos" },
    { name: "Kitchen", href: "/kitchen" },
    { name: "Tables", href: "/tables" },
    { name: "Control", href: "/control-final" },
    { name: "Attendance", href: "/attendance" },
    { name: "History", href: "/history" },
    { name: "Accounting", href: "/accounting" },
    { name: "Payout", href: "/payout" },
  ];

  const Trend = ({ value }) => {
    if (value > 0) return <span className="text-green-400">↑ {value}</span>;
    if (value < 0) return <span className="text-red-400">↓ {Math.abs(value)}</span>;
    return <span className="text-white/40">–</span>;
  };

  return (
    <AppShell>
      <div className="min-h-screen text-white p-6 max-w-7xl mx-auto space-y-10">

        {/* 🔥 HERO */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl shadow-xl">
          <div className="text-white/50 text-sm">System Overview</div>

          <div className="text-4xl mt-2 font-bold">
            ฿{revenue.toLocaleString()}
          </div>

          <div className="text-sm text-white/60 mt-2">
            Orders: {orders} | Avg: ฿{avg}
          </div>

          <div className="mt-4 flex gap-6 text-lg">
            <div>Performance: {performance}%</div>
            <div className={status.color}>{status.label}</div>
          </div>
        </div>

        {/* 🔥 TRENDS */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-white/50 text-sm">Revenue Change</div>
            <div className="text-xl mt-1">
              <Trend value={revTrend} />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-white/50 text-sm">Order Change</div>
            <div className="text-xl mt-1">
              <Trend value={orderTrend} />
            </div>
          </div>
        </div>

        {/* 🔥 ALERTS */}
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
          <div className="text-white/70 text-sm mb-2">Alerts</div>

          {alerts.length === 0 ? (
            <div className="text-white/50 text-sm">No issues detected</div>
          ) : (
            alerts.map((a, i) => (
              <div key={i} className="text-sm mb-1">
                {a}
              </div>
            ))
          )}
        </div>

        {/* 🔥 NAVIGATION */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.map((c, i) => (
            <Link
              key={i}
              href={c.href}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center hover:bg-white/10 transition"
            >
              {c.name}
            </Link>
          ))}
        </div>

      </div>
    </AppShell>
  );
}