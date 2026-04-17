"use client";

import { useEffect, useState } from "react";

export default function POS() {
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("");

  useEffect(() => {
    const name = localStorage.getItem("staffName");
    const role = localStorage.getItem("staffRole");

    if (!name || !role) {
      window.location.href = "/control-final";
    } else {
      setStaffName(name);
      setStaffRole(role);
    }
  }, []);

  const orders = [
    { table: "T12", items: 4, total: 2450, status: "Active" },
    { table: "T08", items: 2, total: 1120, status: "Preparing" },
    { table: "Bar", items: 6, total: 3860, status: "Open" },
  ];

  // ✅ CALCULATE TOTAL REVENUE
  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);

  // ✅ SAVE TO LOCAL STORAGE (SYSTEM CORE)
  useEffect(() => {
    localStorage.setItem("posRevenue", totalRevenue);
  }, [totalRevenue]);

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          alt="POS background"
          className="w-full h-full object-cover"
        />
      </div>

      {/* OVERLAY */}
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.75),rgba(18,12,8,0.85))]" />

      {/* GLOW */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(255,140,0,0.15),transparent_40%)]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 pt-28 pb-14 space-y-8">

        {/* STAFF */}
        <div className="flex justify-between text-sm text-white/60">
          <div>{staffName}</div>
          <div>{staffRole}</div>
        </div>

        {/* HEADER */}
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            Point of Sale
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Live Orders
          </h1>
        </div>

        {/* REVENUE DISPLAY */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6">
          <p className="text-white/50 text-sm">Live Revenue</p>
          <h2 className="text-3xl mt-2 text-[#ffb36b]">
            THB {totalRevenue.toLocaleString()}
          </h2>
        </div>

        {/* ORDERS */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 md:p-8">

          <div className="space-y-4">
            {orders.map((order, i) => (
              <div
                key={i}
                className="flex justify-between items-center p-4 rounded-xl bg-black/30 border border-white/10"
              >
                <div>{order.table}</div>
                <div>{order.items} items</div>
                <div>THB {order.total}</div>
                <div className="text-[#ffb36b]">{order.status}</div>
              </div>
            ))}
          </div>

        </div>

      </div>
    </div>
  );
}