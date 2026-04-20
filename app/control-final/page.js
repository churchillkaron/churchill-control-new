"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ControlFinal() {
  const [orders, setOrders] = useState([]);
  const [saving, setSaving] = useState(false);

  // 🔥 LOAD ORDERS (LIVE)
  useEffect(() => {
    const loadOrders = () => {
      const stored = JSON.parse(localStorage.getItem("orders") || "[]");
      setOrders(stored);
    };

    loadOrders();

    const interval = setInterval(loadOrders, 1000);
    return () => clearInterval(interval);
  }, []);

  // 🔥 ONLY SERVED ORDERS COUNT
  const servedOrders = orders.filter((o) => o.status === "served");

  const revenue = servedOrders.reduce(
    (sum, order) => sum + (order.total || 0),
    0
  );

  const orderCount = servedOrders.length;

  const avgOrderValue =
    orderCount > 0 ? Math.round(revenue / orderCount) : 0;

  // 🔥 PERFORMANCE (simple for now)
  const performance = {
    level:
      revenue > 5000 ? "GOOD" : revenue > 2000 ? "WARNING" : "CRITICAL",
    score: revenue,
  };

  // 🔥 SERVICE (5%)
  const servicePool = Math.round(revenue * 0.05);

  const payoutMultiplier =
    performance.level === "CRITICAL"
      ? 0.2
      : performance.level === "WARNING"
      ? 0.7
      : 1;

  const payoutPool = Math.round(servicePool * payoutMultiplier);

  // 🔥 LOCK DAY
  const lockDay = () => {
    setSaving(true);

    const history = JSON.parse(localStorage.getItem("history") || "[]");

    const newDay = {
      date: new Date().toISOString(),
      revenue,
      orderCount,
      avgOrderValue,
      servicePool,
      payoutPool,
      performanceLevel: performance.level,
      performanceScore: performance.score,
      servedOrders,
    };

    localStorage.setItem("history", JSON.stringify([...history, newDay]));

    // 🔥 CLEAR SYSTEM AFTER LOCK
    localStorage.removeItem("orders");

    alert("Day locked ✅");

    setSaving(false);
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Control Final</h1>

        {/* REVENUE */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="text-sm text-white/50">Revenue (SERVED)</div>
          <div className="text-4xl mt-2">{revenue} THB</div>
          <div className="text-xs text-white/50 mt-2">
            Orders: {orderCount} | Avg: {avgOrderValue}
          </div>
        </div>

        {/* KPI */}
        <div className="grid md:grid-cols-3 gap-4">

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm text-white/50">Service Pool</div>
            <div className="text-xl mt-1">{servicePool} THB</div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm text-white/50">Payout Pool</div>
            <div className="text-xl mt-1">{payoutPool} THB</div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm text-white/50">Performance</div>
            <div className="text-xl mt-1">{performance.level}</div>
          </div>

        </div>

        {/* SERVED ORDERS LIST (IMPORTANT VISIBILITY) */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg">Served Orders</h2>

          {servedOrders.length === 0 && (
            <div className="text-white/40 text-sm">No served orders yet</div>
          )}

          {servedOrders.map((order) => (
            <div
              key={order.id}
              className="flex justify-between text-sm border-b border-white/10 pb-2"
            >
              <span>Table {order.table}</span>
              <span>{order.total} THB</span>
            </div>
          ))}
        </div>

        {/* ACTION */}
        <button
          onClick={lockDay}
          disabled={saving}
          className="bg-[#ff7a00] px-6 py-3 rounded-xl text-white"
        >
          {saving ? "Locking..." : "Lock Day"}
        </button>

      </div>
    </AppShell>
  );
}