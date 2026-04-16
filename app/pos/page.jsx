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
    { table: "T12", items: 4, total: "2,450", status: "Active" },
    { table: "T08", items: 2, total: "1,120", status: "Preparing" },
    { table: "Bar", items: 6, total: "3,860", status: "Open" },
  ];

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

        {/* STAFF INFO */}
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
          <p className="text-white/60 mt-2 max-w-xl">
            Real-time overview of all active tables, orders, and transaction flow.
          </p>
        </div>

        {/* HERO */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 md:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <div>
              <p className="text-white/50 text-sm">Active Tables</p>
              <h2 className="text-3xl mt-2">18</h2>
            </div>

            <div>
              <p className="text-white/50 text-sm">Open Orders</p>
              <h2 className="text-3xl mt-2">42</h2>
            </div>

            <div>
              <p className="text-white/50 text-sm">Current Flow</p>
              <h2 className="text-3xl mt-2 text-[#ffb36b]">High</h2>
            </div>

          </div>
        </div>

        {/* ORDER LIST */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 md:p-8">

          <div className="flex justify-between mb-4">
            <h3 className="text-xl font-semibold">Active Orders</h3>
            <p className="text-white/50 text-sm">Live updates</p>
          </div>

          <div className="space-y-4">
            {orders.map((order, i) => (
              <div
                key={i}
                className="flex justify-between items-center p-4 rounded-xl bg-black/30 border border-white/10"
              >
                <div>
                  <p className="text-sm text-white/50">Table</p>
                  <p className="text-lg font-medium">{order.table}</p>
                </div>

                <div>
                  <p className="text-sm text-white/50">Items</p>
                  <p className="text-lg">{order.items}</p>
                </div>

                <div>
                  <p className="text-sm text-white/50">Total</p>
                  <p className="text-lg">THB {order.total}</p>
                </div>

                <div className="text-right">
                  <p className="text-sm text-white/50">Status</p>
                  <p className="text-[#ffb36b]">{order.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}