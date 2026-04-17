"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ControlFinal() {
  const [revenue, setRevenue] = useState(0);
  const [paidOrders, setPaidOrders] = useState([]);

  const loadData = () => {
    const data = JSON.parse(localStorage.getItem("history_day") || "{}");
    setRevenue(data.revenue || 0);
    setPaidOrders(data.paidOrders || []);
  };

  useEffect(() => {
    loadData();

    // 🔥 REAL-TIME SYNC (no polling)
    const handleStorageChange = () => {
      loadData();
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const closeDay = () => {
    const todayData = JSON.parse(localStorage.getItem("history_day") || "{}");

    if (!todayData.revenue || todayData.revenue === 0) {
      alert("No data to close");
      return;
    }

    if (!todayData.paidOrders || todayData.paidOrders.length === 0) {
      alert("No paid orders");
      return;
    }

    const history = JSON.parse(localStorage.getItem("history") || "[]");

    const todayKey = new Date().toDateString();

    const alreadyClosed = history.some(
      (day) => new Date(day.date).toDateString() === todayKey
    );

    if (alreadyClosed) {
      alert("Day already closed");
      return;
    }

    const closedDay = {
      date: new Date().toISOString(),
      revenue: todayData.revenue,
      serviceCharge: Math.round(todayData.revenue * 0.05),
      paidOrders: todayData.paidOrders || [],
    };

    const updatedHistory = [...history, closedDay];

    localStorage.setItem("history", JSON.stringify(updatedHistory));

    // 🔥 HARD RESET SYSTEM STATE
    localStorage.removeItem("history_day");
    localStorage.removeItem("orders");

    setRevenue(0);
    setPaidOrders([]);

    alert("Day closed successfully");
  };

  const serviceCharge = Math.round(revenue * 0.05);

  return (
    <AppShell>
      <div className="space-y-10">

        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            Control Final
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            End-of-Day Control
          </h1>
        </div>

        {/* 🔥 MAIN REVENUE CARD */}
        <div className="relative">
          <div className="absolute -inset-4 bg-[#ff7a00]/10 blur-2xl rounded-3xl" />

          <div className="relative rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-2xl p-6 md:p-8 flex justify-between items-center">

            <div>
              <p className="text-white/50 text-sm">
                Today Revenue
              </p>

              <div className="text-4xl md:text-6xl font-semibold mt-2">
                THB {revenue.toLocaleString()}
              </div>

              <p className="text-white/50 mt-3">
                Service Charge (5%): THB {serviceCharge.toLocaleString()}
              </p>

              <p className="text-white/30 text-xs mt-2">
                Paid Orders: {paidOrders.length}
              </p>
            </div>

            <button
              onClick={closeDay}
              className="bg-[#ff7a00] px-6 py-3 rounded-xl text-black font-semibold"
            >
              Close Day
            </button>

          </div>
        </div>

        {/* 🔥 PAID ORDERS LIST (CONTROL VISIBILITY) */}
        <div className="space-y-4">
          <h2 className="text-xl text-white/60">Paid Orders</h2>

          {paidOrders.length === 0 && (
            <p className="text-white/30">No completed orders yet</p>
          )}

          {paidOrders.map((order) => (
            <div
              key={order.id}
              className="flex justify-between items-center bg-white/5 p-4 rounded-xl"
            >
              <div>
                Table {order.table} — {order.items.length} items
              </div>
              <div>THB {order.total}</div>
            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}