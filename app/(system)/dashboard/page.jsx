"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "../../AppShell.js";

export default function DashboardPage() {
  const [revenue, setRevenue] = useState(0);
  const [orders, setOrders] = useState(0);
  const [avg, setAvg] = useState(0);

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem("history") || "[]");
    const latest = history[history.length - 1] || {};

    setRevenue(latest.revenue || 0);
    setOrders(latest.totalOrders || 0);
    setAvg(latest.avgOrderValue || 0);
  }, []);

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

  return (
    <AppShell>
      <div className="min-h-screen text-white p-6 max-w-7xl mx-auto space-y-10">

        {/* TOP KPI */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-sm text-white/50">Revenue Today</div>
          <div className="text-3xl mt-2">
            {revenue.toLocaleString()} THB
          </div>

          <div className="text-sm text-white/50 mt-2">
            Orders: {orders} | Avg: {avg}
          </div>

          <div className="text-green-400 mt-2 text-sm">
            Level: GOOD
          </div>
        </div>

        {/* ALERT */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-white/60">
          Alerts  
          <div className="text-sm mt-1">No alerts</div>
        </div>

        {/* GRID */}
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
