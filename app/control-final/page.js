"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ControlFinal() {
  const [orders, setOrders] = useState([]);
  const [revenue, setRevenue] = useState(0);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    const paid = stored.filter((o) => o.status === "Paid");

    setOrders(paid);

    const total = paid.reduce((sum, o) => sum + o.total, 0);
    setRevenue(total);
  }, []);

  const serviceCharge = Math.round(revenue * 0.05);

  const closeDay = () => {
    const history = JSON.parse(localStorage.getItem("history") || "[]");

    const dayData = {
      date: new Date().toISOString(),
      revenue,
      serviceCharge,
      paidOrders: orders,
    };

    history.push(dayData);

    localStorage.setItem("history", JSON.stringify(history));

    // clear orders for next day
    localStorage.removeItem("orders");

    alert("Day closed and saved to history");
  };

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

        <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-8 flex justify-between items-center">

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
    </AppShell>
  );
}