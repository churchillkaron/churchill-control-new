"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);

  // 🔥 LOAD ORDERS
  const loadOrders = () => {
    try {
      const data = JSON.parse(localStorage.getItem("orders") || "[]");

      // Only active orders
      const active = data.filter(
        (o) => o.status === "NEW" || o.status === "PREPARING"
      );

      // newest first
      active.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setOrders(active);
    } catch (e) {
      console.error("Error loading orders", e);
    }
  };

  useEffect(() => {
    loadOrders();

    const interval = setInterval(loadOrders, 1000);

    return () => clearInterval(interval);
  }, []);

  // 🔥 UPDATE STATUS
  const updateStatus = (id, currentStatus) => {
    const all = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = all.map((order) => {
      if (order.id !== id) return order;

      if (currentStatus === "NEW") {
        return { ...order, status: "PREPARING" };
      }

      if (currentStatus === "PREPARING") {
        return { ...order, status: "SERVED" };
      }

      return order;
    });

    localStorage.setItem("orders", JSON.stringify(updated));
    loadOrders();
  };

  return (
    <AppShell>
      <div className="space-y-6">

        {/* HEADER */}
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            Kitchen
          </p>
          <h1 className="text-4xl md:text-5xl font-semibold mt-2">
            Kitchen Screen
          </h1>
        </div>

        {/* ORDERS GRID */}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">

          {orders.length === 0 && (
            <div className="text-white/40">
              No active orders
            </div>
          )}

          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col space-y-4"
            >

              {/* ORDER HEADER */}
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

              {/* ITEMS */}
              <div className="space-y-3 flex-1">

                {order.items.map((item, index) => (
                  <div
                    key={index}
                    className="border-b border-white/10 pb-2"
                  >

                    <div className="font-medium">
                      {item.qty}x {item.name}
                    </div>

                    <div className="text-sm text-white/60 ml-3 space-y-1">

                      {item.modifier && (
                        <div>• {item.modifier}</div>
                      )}

                      {item.side && (
                        <div>• {item.side}</div>
                      )}

                      {item.sauce && (
                        <div>• {item.sauce}</div>
                      )}

                    </div>

                  </div>
                ))}

              </div>

              {/* STATUS BUTTON */}
              <button
                onClick={() => updateStatus(order.id, order.status)}
                className="w-full bg-[#ff7a00] py-3 rounded-xl text-black font-semibold text-lg"
              >
                {order.status === "NEW" && "Start Cooking"}
                {order.status === "PREPARING" && "Mark as Served"}
              </button>

            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}