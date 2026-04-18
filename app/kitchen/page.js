"use client";

import { useEffect, useState, useRef } from "react";
import AppShell from "../AppShell";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [station, setStation] = useState("");
  const prevOrderCount = useRef(0);

  useEffect(() => {
    const role = (localStorage.getItem("staffRole") || "").toUpperCase();

    if (role === "THAI") setStation("THAI");
    else if (role === "WESTERN") setStation("WESTERN");
    else if (role === "PIZZA") setStation("PIZZA");
    else if (role === "BAR") setStation("BAR");
    else setStation("WESTERN");
  }, []);

  // getCourse → defines course type
  const getCourse = (item) => {
    if (["Beer", "Soft Drink", "Wine", "Cocktails", "Spirit"].includes(item.category)) return "DRINK";
    if (item.category === "Starter") return "STARTER";
    if (item.category === "Dessert") return "DESSERT";
    return "MAIN";
  };

  const loadOrders = () => {
    try {
      const data = JSON.parse(localStorage.getItem("orders") || "[]");

      const filtered = data
        .map((order) => {
          const startersReady = order.items
            .filter((i) => getCourse(i) === "STARTER")
            .every((i) => i.status === "READY");

          return {
            ...order,
            items: order.items
              .filter((item) => {
                if (item.station !== station) return false;
                if (item.status === "READY") return false;

                const course = getCourse(item);

                // 🔥 COURSE FLOW LOGIC
                if (course === "MAIN" && !startersReady) return false;

                return true;
              })
              .sort((a, b) => {
                const priority = { NEW: 0, PREPARING: 1 };
                return priority[a.status] - priority[b.status];
              }),
          };
        })
        .filter((order) => order.items.length > 0)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      if (filtered.length > prevOrderCount.current) {
        const audio = new Audio("/alert.mp3");
        audio.play().catch(() => {});
      }

      prevOrderCount.current = filtered.length;
      setOrders(filtered);
    } catch (e) {
      console.error("Error loading kitchen orders", e);
    }
  };

  useEffect(() => {
    if (!station) return;

    loadOrders();

    const interval = setInterval(loadOrders, 1000);
    return () => clearInterval(interval);
  }, [station]);

  // updateStatus → item status control
  const updateStatus = (orderId, itemIndex, currentStatus) => {
    const all = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = all.map((order) => {
      if (order.id !== orderId) return order;

      const updatedItems = order.items.map((item, i) => {
        if (i !== itemIndex) return item;

        if (currentStatus === "NEW") {
          return { ...item, status: "PREPARING" };
        }

        if (currentStatus === "PREPARING") {
          return { ...item, status: "READY" };
        }

        return item;
      });

      return { ...order, items: updatedItems };
    });

    localStorage.setItem("orders", JSON.stringify(updated));
    loadOrders();
  };

  const getDelayColor = (createdAt) => {
    const diff = (Date.now() - new Date(createdAt)) / 1000;

    if (diff > 900) return "bg-red-700/40";
    if (diff > 600) return "bg-red-600/30";
    if (diff > 300) return "bg-orange-500/30";
    return "bg-white/5";
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            {station || "Kitchen"}
          </p>
          <h1 className="text-4xl md:text-5xl font-semibold mt-2">
            {station || "Kitchen"} Screen
          </h1>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {orders.length === 0 && (
            <div className="text-white/40">
              No active orders
            </div>
          )}

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

                <div className="text-sm text-white/50">
                  Staff: {order.staff}
                </div>
              </div>

              <div className="space-y-3">
                {order.items.map((item, index) => (
                  <div
                    key={index}
                    className="border-b border-white/10 pb-2"
                  >
                    <div className="flex justify-between items-center">
                      <div className="font-medium">
                        {item.qty}x {item.name}
                      </div>
                      <div className="text-xs text-white/50">
                        {item.status}
                      </div>
                    </div>

                    <div className="text-sm text-white/60 ml-3 space-y-1">
                      {item.modifier && <div>• {item.modifier}</div>}
                      {item.side && <div>• {item.side}</div>}
                      {item.sauce && <div>• {item.sauce}</div>}
                    </div>

                    <button
                      onClick={() =>
                        updateStatus(order.id, index, item.status)
                      }
                      className="w-full mt-3 bg-[#ff7a00] py-2 rounded-xl text-black font-semibold"
                    >
                      {item.status === "NEW" && "Start Cooking"}
                      {item.status === "PREPARING" && "Mark Ready"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}