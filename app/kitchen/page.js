"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [station, setStation] = useState("");

  useEffect(() => {
    const role = localStorage.getItem("staffRole");

    // 🔥 MAP ROLE → STATION
    if (role === "THAI") setStation("THAI");
    if (role === "WESTERN") setStation("WESTERN");
    if (role === "PIZZA") setStation("PIZZA");
    if (role === "BAR") setStation("BAR");

  }, []);

  const loadOrders = () => {
    const data = JSON.parse(localStorage.getItem("orders") || "[]");

    const filtered = data
      .filter((o) => o.status !== "SERVED")
      .map((order) => ({
        ...order,
        items: order.items.filter((item) => item.station === station),
      }))
      .filter((order) => order.items.length > 0);

    setOrders(filtered);
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 1000);
    return () => clearInterval(interval);
  }, [station]);

  const updateStatus = (id, currentStatus) => {
    const all = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = all.map((order) => {
      if (order.id !== id) return order;

      if (currentStatus === "NEW") return { ...order, status: "PREPARING" };
      if (currentStatus === "PREPARING") return { ...order, status: "SERVED" };

      return order;
    });

    localStorage.setItem("orders", JSON.stringify(updated));
    loadOrders();
  };

  return (
    <AppShell>
      <div className="space-y-6">

        <h1 className="text-4xl font-semibold">
          {station} Kitchen
        </h1>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">

          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4"
            >

              <div>
                <div className="text-lg font-semibold">
                  Table {order.table}
                </div>

                <div className="text-sm text-white/50">
                  {new Date(order.created_at).toLocaleTimeString()}
                </div>
              </div>

              <div className="space-y-3">

                {order.items.map((item, i) => (
                  <div key={i} className="border-b border-white/10 pb-2">

                    <div className="font-medium">
                      {item.qty}x {item.name}
                    </div>

                    <div className="text-sm text-white/60 ml-3">
                      {item.modifier && <div>• {item.modifier}</div>}
                      {item.side && <div>• {item.side}</div>}
                      {item.sauce && <div>• {item.sauce}</div>}
                    </div>

                  </div>
                ))}

              </div>

              <button
                onClick={() => updateStatus(order.id, order.status)}
                className="w-full bg-[#ff7a00] py-3 rounded-xl text-black font-semibold"
              >
                {order.status === "NEW" && "Start"}
                {order.status === "PREPARING" && "Done"}
              </button>

            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}