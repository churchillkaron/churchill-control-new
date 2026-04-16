"use client";

import { useEffect, useState } from "react";

export default function POS() {
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [orders, setOrders] = useState([]);
  const [table, setTable] = useState("");

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

  // 🍽 MENU (you can expand later)
  const menu = [
    { name: "Pad Thai", price: 160 },
    { name: "Green Curry", price: 170 },
    { name: "Massaman Curry", price: 180 },
    { name: "Beef Carpaccio", price: 320 },
    { name: "Tom Yum Goong", price: 180 },
  ];

  const addDish = (dish) => {
    if (!table) return;

    const newOrder = {
      table,
      items: 1,
      total: dish.price,
      name: dish.name,
      staff: staffName,
      status: "Open",
    };

    setOrders((prev) => [...prev, newOrder]);
  };

  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);

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

        {/* TABLE INPUT */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 flex gap-4">

          <input
            value={table}
            onChange={(e) => setTable(e.target.value)}
            placeholder="Table number"
            className="bg-black/40 px-4 py-2 rounded-xl border border-white/10 w-full"
          />

        </div>

        {/* 🍽 MENU GRID */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

          {menu.map((dish, i) => (
            <button
              key={i}
              onClick={() => addDish(dish)}
              className="p-4 rounded-2xl bg-black/40 border border-white/10 hover:bg-black/60 transition"
            >
              <p className="font-medium">{dish.name}</p>
              <p className="text-sm text-white/50">THB {dish.price}</p>
            </button>
          ))}

        </div>

        {/* SUMMARY */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6">
          <p className="text-white/50 text-sm">Total Revenue</p>
          <h2 className="text-3xl mt-2">THB {totalRevenue}</h2>
        </div>

        {/* ORDER LIST */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 space-y-4">

          {orders.map((order, i) => (
            <div
              key={i}
              className="flex justify-between items-center p-4 rounded-xl bg-black/30 border border-white/10"
            >
              <div>{order.table}</div>
              <div>{order.name}</div>
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