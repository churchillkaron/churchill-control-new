"use client";

import { useEffect, useState } from "react";

export default function POS() {
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const name = localStorage.getItem("staffName");
    const role = localStorage.getItem("staffRole");

    if (!name || !role) {
      window.location.href = "/control-final";
    } else {
      setStaffName(name);
      setStaffRole(role);
    }

    // Load orders
    const savedOrders = JSON.parse(localStorage.getItem("orders")) || [];
    setOrders(savedOrders);
  }, []);

  // ➕ CREATE ORDER (simulate new order)
  const createOrder = () => {
    const newOrder = {
      table: "T" + Math.floor(Math.random() * 20),
      items: Math.floor(Math.random() * 5) + 1,
      total: Math.floor(Math.random() * 2000) + 500,
      status: "Active",
      staff: staffName,
      time: new Date().toISOString(),
    };

    const updated = [...orders, newOrder];

    setOrders(updated);
    localStorage.setItem("orders", JSON.stringify(updated));

    // 🔥 ALSO UPDATE TOTAL REVENUE
    const revenue =
      updated.reduce((sum, o) => sum + Number(o.total), 0);

    localStorage.setItem("totalRevenue", revenue);
  };

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
        </div>

        {/* CREATE ORDER BUTTON */}
        <button
          onClick={createOrder}
          className="bg-[#ff7a00] px-6 py-3 rounded-xl"
        >
          Create Order
        </button>

        {/* ORDER LIST */}
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
                <div className="text-white/40 text-xs">
                  {order.staff}
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>
    </div>
  );
}