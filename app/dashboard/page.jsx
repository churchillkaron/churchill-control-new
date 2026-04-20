"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  calculateFOH,
  getPerformanceLevel,
} from "../../lib/performance";
export default function Dashboard() {
  const [role, setRole] = useState("");
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("current_user"));
    if (user) setRole(user.role);

    loadOrders();
    const interval = setInterval(loadOrders, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadOrders = () => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");
    setOrders(stored);
  };

  const foh = calculateFOH(orders);
  const performance = getPerformanceLevel(foh.score);

  const alerts = [];

  if (performance.level === "BAD" || performance.level === "CRITICAL") {
    alerts.push("⚠️ Performance dropping");
  }

  if (foh.orderCount < 3) {
    alerts.push("⚠️ Low order volume");
  }

  const Card = ({ href, title }) => (
    <Link
      href={href}
      className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white text-center text-lg hover:bg-white/10"
    >
      {title}
    </Link>
  );

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Control Hub</h1>

        {/* 🔥 PERFORMANCE */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
          <div className="text-sm text-white/50">Live Performance</div>

          <div className="text-3xl">
            {foh.revenue} THB
          </div>

          <div className="text-sm text-white/50">
            Orders: {foh.orderCount} | Avg: {foh.avg}
          </div>

          <div>
            Level:{" "}
            <span
              className={
                performance.level === "GOOD"
                  ? "text-green-400"
                  : performance.level === "WARNING"
                  ? "text-yellow-400"
                  : performance.level === "BAD"
                  ? "text-orange-400"
                  : "text-red-500"
              }
            >
              {performance.level}
            </span>
          </div>
        </div>

        {/* 🔥 ALERTS */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-2">
          <div className="text-sm text-white/50">Alerts</div>

          {alerts.length === 0 && (
            <div className="text-white/40">No alerts</div>
          )}

          {alerts.map((a, i) => (
            <div key={i} className="text-yellow-400 text-sm">
              {a}
            </div>
          ))}
        </div>

        {/* 🔥 NAVIGATION */}
        <div className="grid grid-cols-2 gap-4">

          {role === "owner" && (
            <>
              <Card href="/pos" title="POS" />
              <Card href="/kitchen" title="Kitchen" />
              <Card href="/tables" title="Tables" />

              <Card href="/control-final" title="Control" />
              <Card href="/attendance" title="Attendance" />
              <Card href="/dashboard/performance" title="Performance" />

              <Card href="/history" title="History" />
              <Card href="/accounting" title="Accounting" />
              <Card href="/payout" title="Payout" />
            </>
          )}

          {(role === "gm" || role === "manager") && (
            <>
              <Card href="/pos" title="POS" />
              <Card href="/kitchen" title="Kitchen" />
              <Card href="/tables" title="Tables" />

              <Card href="/control-final" title="Control" />
              <Card href="/attendance" title="Attendance" />
              <Card href="/dashboard/performance" title="Performance" />

              <Card href="/history" title="History" />
            </>
          )}

          {role === "accounting" && (
            <>
              <Card href="/accounting" title="Accounting" />
              <Card href="/history" title="History" />
              <Card href="/payout" title="Payout" />
            </>
          )}

          {(role === "kitchen" || role === "staff") && (
            <>
              <Card href="/pos" title="POS" />
              <Card href="/kitchen" title="Kitchen" />
            </>
          )}

        </div>

      </div>
    </AppShell>
  );
}