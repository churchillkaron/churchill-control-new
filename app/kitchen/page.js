"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");
    setOrders(stored);
  }, []);

  const updateStatus = (orderId, itemId, newStatus) => {
    const updated = orders.map((order) => {
      if (order.id !== orderId) return order;

      const updatedItems = order.items.map((item) => {
        if (item.id !== itemId) return item;
        return { ...item, status: newStatus };
      });

      return { ...order, items: updatedItems };
    });

    setOrders(updated);
    localStorage.setItem("orders", JSON.stringify(updated));
  };

  const stations = ["THAI", "WESTERN", "PIZZA"];

  return (
    <AppShell>
      <div className="space-y-10 text-white">
        <h1 className="text-3xl">Kitchen</h1>

        <div className="grid md:grid-cols-3 gap-6">
          {stations.map((station) => {
            const stationOrders = orders
              .map((order) => ({
                ...order,
                stationItems: order.items.filter((item) => item.station === station),
              }))
              .filter((order) => order.stationItems.length > 0);

            return (
              <div
                key={station}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4"
              >
                <div className="text-lg">{station}</div>

                {stationOrders.length === 0 && (
                  <div className="text-white/40 text-sm">No orders</div>
                )}

                {stationOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex justify-between items-center">
                      <div>Table: {order.table || "-"}</div>
                      <div className="text-white/50 text-xs">
                        {new Date(order.created_at).toLocaleTimeString()}
                      </div>
                    </div>

                    {order.stationItems.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white/5 rounded-xl p-3 space-y-2"
                      >
                        <div>{item.name}</div>

                        {item.modifier && (
                          <div className="text-white/50 text-sm">• {item.modifier}</div>
                        )}
                        {item.side && (
                          <div className="text-white/50 text-sm">• {item.side}</div>
                        )}
                        {item.sauce && (
                          <div className="text-white/50 text-sm">• {item.sauce}</div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => updateStatus(order.id, item.id, "COOKING")}
                            className="px-3 py-1 rounded-lg bg-yellow-500 text-black text-sm"
                          >
                            Cooking
                          </button>

                          <button
                            onClick={() => updateStatus(order.id, item.id, "DONE")}
                            className="px-3 py-1 rounded-lg bg-green-500 text-black text-sm"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}