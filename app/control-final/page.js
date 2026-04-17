"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ControlFinal() {
  const [revenue, setRevenue] = useState(0);

  const loadData = () => {
    const data = JSON.parse(localStorage.getItem("history_day") || "{}");
    setRevenue(data.revenue || 0);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 500);
    return () => clearInterval(interval);
  }, []);

  const closeDay = () => {
    const todayData = JSON.parse(localStorage.getItem("history_day") || "{}");

    if (!todayData.revenue) {
      alert("No data to close");
      return;
    }

    const history = JSON.parse(localStorage.getItem("history") || "[]");

    const todayKey = new Date().toDateString();

    // 🔥 prevent duplicate same day
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

    localStorage.removeItem("history_day");
    localStorage.removeItem("orders");

    setRevenue(0);

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
            </div>

            <button
              onClick={closeDay}
              className="bg-[#ff7a00] px-6 py-3 rounded-xl text-black font-semibold"
            >
              Close Day
            </button>

          </div>

        </div>

      </div>
    </AppShell>
  );
}