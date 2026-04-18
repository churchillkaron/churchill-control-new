"use client";

import { useEffect, useState, useRef } from "react";
import AppShell from "../AppShell";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [station, setStation] = useState("");
  const prevOrderCount = useRef(0);

  useEffect(() => {
    const role = localStorage.getItem("staffRole");

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

    // 🔊 SOUND ON NEW ORDER
    if (filtered.length > prevOrderCount.current) {
      const audio = new Audio("/alert.mp3");
      audio.play().catch(() => {});
    }

    prevOrderCount.current = filtered.length;

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

  // 🔥 TIME COLOR SYSTEM
  const getDelayColor = (created_at) => {
    const diff = (Date.now() - new Date(created_at)) / 1000;

    if (diff > 600) return "bg-red-600/30";      // 10 min
    if (diff > 300) return "bg-orange-500/30";   // 5 min
    return "bg-white/5";
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
              className={`${getDelayColor(order.created_at)} border border-white/10 rounded-2xl p-5 space-y-4`}
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
                className="w-full bg-[#ff7a00] py-3 rounded-xl text-black font-semibold text-lg"
              >
                {order.status === "NEW" && "Start Cooking"}
                {order.status === "PREPARING" && "Mark Done"}
              </button>

            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}