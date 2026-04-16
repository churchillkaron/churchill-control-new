"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem("systemOrders");
    if (saved) {
      setOrders(JSON.parse(saved));
    }
  }, []);

  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const activeOrders = orders.filter(o => o.status !== "Served").length;
  const totalOrders = orders.length;

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          className="w-full h-full object-cover"
        />
      </div>

      {/* OVERLAY */}
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.75),rgba(18,12,8,0.85))]" />

      {/* GLOW */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(255,140,0,0.15),transparent_40%)]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 pt-28 pb-14 space-y-8">

        {/* HEADER */}
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            Dashboard
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            System Overview
          </h1>
          <p className="text-white/60 mt-2">
            Real-time data from POS system
          </p>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6">
            <p className="text-white/50 text-sm">Total Revenue</p>
            <h2 className="text-3xl mt-2">THB {totalRevenue}</h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6">
            <p className="text-white/50 text-sm">Active Orders</p>
            <h2 className="text-3xl mt-2">{activeOrders}</h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6">
            <p className="text-white/50 text-sm">Total Orders</p>
            <h2 className="text-3xl mt-2">{totalOrders}</h2>
          </div>

        </div>

        {/* RECENT ORDERS */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 space-y-4">

          <div className="flex justify-between">
            <h3 className="text-xl font-semibold">Recent Orders</h3>
            <p className="text-white/50 text-sm">Live</p>
          </div>

          {orders.slice(-5).reverse().map((order, i) => (
            <div
              key={i}
              className="flex justify-between items-center p-4 rounded-xl bg-black/30 border border-white/10"
            >
              <div>{order.table}</div>
              <div>{order.name} x{order.items}</div>
              <div>THB {order.total}</div>
              <div>{order.staff}</div>
              <div className="text-[#ffb36b]">{order.status}</div>
            </div>
          ))}

        </div>

      </div>
    </div>
  );
}