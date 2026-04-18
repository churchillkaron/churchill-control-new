"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ControlFinal() {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({
    revenue: 0,
    totalOrders: 0,
    avgOrderValue: 0,
  });

  const loadOrders = () => {
    try {
      const data = JSON.parse(localStorage.getItem("orders") || "[]");
      setOrders(data);
    } catch (e) {
      console.error("Error loading orders", e);
    }
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const paidOrders = orders.filter((o) => o.status === "PAID");

    const revenue = paidOrders.reduce(
      (sum, order) => sum + (order.total || 0),
      0
    );

    const totalOrders = paidOrders.length;

    const avgOrderValue =
      totalOrders > 0 ? Math.round(revenue / totalOrders) : 0;

    setSummary({
      revenue,
      totalOrders,
      avgOrderValue,
    });
  }, [orders]);

  // 🔥 CLOSE DAY (UPGRADED STRUCTURE)
  const closeDay = () => {
    const paidOrders = orders.filter((o) => o.status === "PAID");

    const revenue = paidOrders.reduce(
      (sum, order) => sum + (order.total || 0),
      0
    );

    const totalOrders = paidOrders.length;

    const avgOrderValue =
      totalOrders > 0 ? Math.round(revenue / totalOrders) : 0;

    const serviceCharge = Math.round(revenue * 0.05);

    // 🔥 SIMPLE PERFORMANCE PLACEHOLDER (SAFE)
    const fohScore =
      totalOrders > 0
        ? avgOrderValue > 500
          ? "GOOD"
          : avgOrderValue > 300
          ? "WARNING"
          : "BAD"
        : "—";

    const newDay = {
      date: new Date().toLocaleDateString("en-GB"),

      revenue,
      serviceCharge,

      paidOrders,

      totalOrders,
      avgOrderValue,

      fohScore,
      kitchenLevel: "-",
      barLevel: "-",

      staff: [], // keep safe, no break
    };

    const history =
      JSON.parse(localStorage.getItem("history") || "[]");

    const updatedHistory = [...history, newDay];

    localStorage.setItem("history", JSON.stringify(updatedHistory));

    localStorage.removeItem("orders");

    alert("Day closed and saved");
    window.location.reload();
  };

  return (
    <AppShell>
      <div className="space-y-10">

        {/* HEADER */}
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            Control Final
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Daily Overview
          </h1>
        </div>

        {/* KPI */}
        <div className="grid md:grid-cols-3 gap-6">

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="text-white/50 text-sm">Revenue</div>
            <div className="text-3xl font-semibold mt-2">
              THB {summary.revenue}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="text-white/50 text-sm">Orders</div>
            <div className="text-3xl font-semibold mt-2">
              {summary.totalOrders}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="text-white/50 text-sm">Avg Order</div>
            <div className="text-3xl font-semibold mt-2">
              THB {summary.avgOrderValue}
            </div>
          </div>

        </div>

        {/* CLOSE DAY */}
        <div>
          <button
            onClick={closeDay}
            className="bg-[#ff7a00] px-6 py-3 rounded-xl text-white"
          >
            Close Day
          </button>
        </div>

        {/* ORDERS */}
        <div className="space-y-4">
          {orders
            .filter((o) => o.status === "PAID")
            .map((order) => (
              <div
                key={order.id}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between"
              >
                <div>
                  Table {order.table} — {order.items?.length || 0} items
                </div>
                <div>THB {order.total}</div>
              </div>
            ))}
        </div>

      </div>
    </AppShell>
  );
}