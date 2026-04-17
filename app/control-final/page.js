"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ControlFinal() {
  const [revenue, setRevenue] = useState(0);
  const [paidOrders, setPaidOrders] = useState([]);
  const [serviceLevel, setServiceLevel] = useState(5);

  const loadData = () => {
    const data = JSON.parse(localStorage.getItem("history_day") || "{}");
    const history = JSON.parse(localStorage.getItem("history") || "[]");

    setRevenue(data.revenue || 0);
    setPaidOrders(data.paidOrders || []);

    // 🔥 SAME LOGIC AS DASHBOARD (LOCKED SYSTEM)
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

    const avgOrderValue =
      avgRevenue / (avgOrders || 1);

    let level = 5;

    if (avgOrderValue > 500 && avgOrders > 80) {
      level = 7;
    } else if (avgOrderValue > 350 && avgOrders > 40) {
      level = 6;
    }

    setServiceLevel(level);
  };

  useEffect(() => {
    loadData();

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
    const history = JSON.parse(localStorage.getItem("history") || "[]");

    if (!todayData.revenue || todayData.revenue === 0) {
      alert("No data to close");
      return;
    }

    if (!todayData.paidOrders || todayData.paidOrders.length === 0) {
      alert("No paid orders");
      return;
    }

    const todayKey = new Date().toDateString();

    const alreadyClosed = history.some(
      (day) => new Date(day.date).toDateString() === todayKey
    );

    if (alreadyClosed) {
      alert("Day already closed");
      return;
    }

    const serviceChargeValue = Math.round(
      todayData.revenue * (serviceLevel / 100)
    );

    const closedDay = {
      date: new Date().toISOString(),
      revenue: todayData.revenue,
      serviceCharge: serviceChargeValue,
      serviceLevel: serviceLevel, // 🔥 IMPORTANT (store level)
      paidOrders: todayData.paidOrders || [],
    };

    const updatedHistory = [...history, closedDay];

    localStorage.setItem("history", JSON.stringify(updatedHistory));

    // 🔥 RESET SYSTEM
    localStorage.removeItem("history_day");
    localStorage.removeItem("orders");

    setRevenue(0);
    setPaidOrders([]);

    alert(`Day closed with ${serviceLevel}% service charge`);
  };

  const serviceCharge = Math.round(revenue * (serviceLevel / 100));

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

        {/* 🔥 MAIN CARD */}
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
                Service Charge ({serviceLevel}%): THB {serviceCharge.toLocaleString()}
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

        {/* 🔥 PAID ORDERS */}
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