"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function POS() {
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const name = localStorage.getItem("staffName");
    const role = localStorage.getItem("staffRole");

    if (!name || !role) {
      window.location.href = "/";
      return;
    }

    setStaffName(name);
    setStaffRole(role);

    const savedOrders =
      JSON.parse(localStorage.getItem("orders")) || [];

    setOrders(savedOrders);
  }, []);

  const createOrder = () => {
    const newOrder = {
      id: Date.now(),
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
  };

  return (
    <AppShell>
      <div className="space-y-10">

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

        {/* CREATE ORDER */}
        <button
          onClick={createOrder}
          className="bg-[#ff7a00] px-6 py-3 rounded-xl text-black font-medium shadow-lg hover:scale-[1.02] transition"
        >
          Create Order
        </button>

        {/* ORDER LIST */}
        <div className="relative">
          <div className="absolute -inset-4 bg-[#ff7a00]/10 blur-2xl rounded-3xl" />

          <div className="relative rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-2xl p-6 md:p-8 shadow-[0_25px_80px_rgba(0,0,0,0.6)]">

            {orders.length === 0 && (
              <div className="text-white/40">
                No orders yet
              </div>
            )}

            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order.id}
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
    </AppShell>
  );
}