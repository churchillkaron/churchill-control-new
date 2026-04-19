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

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        {/* Title */}
        <h1 className="text-3xl">Kitchen</h1>

        <div className="space-y-6">

          {orders.length === 0 && (
            <div className="text-white/50">No orders yet</div>
          )}

          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4"
            >

              {/* Order Header */}
              <div className="flex justify-between items-center">
                <div className="text-lg">
                  Table: {order.table || "-"}
                </div>
                <div className="text-white/50 text-sm">
                  {new Date(order.created_at).toLocaleTimeString()}
                </div>
              </div>

              {/* Items */}
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center bg-white/5 rounded-xl p-3"
                  >

                    <div>
                      <div>{item.name}</div>

                      {item.modifier && (
                        <div className="text-white/50 text-sm">
                          • {item.modifier}
                        </div>
                      )}

                      {item.side && (
                        <div className="text-white/50 text-sm">
                          • {item.side}
                        </div>
                      )}

                      {item.sauce && (
                        <div className="text-white/50 text-sm">
                          • {item.sauce}
                        </div>
                      )}
                    </div>

                    {/* Status Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          updateStatus(order.id, item.id, "COOKING")
                        }
                        className="px-3 py-1 rounded-lg bg-yellow-500 text-black text-sm"
                      >
                        Cooking
                      </button>

                      <button
                        onClick={() =>
                          updateStatus(order.id, item.id, "DONE")
                        }
                        className="px-3 py-1 rounded-lg bg-green-500 text-black text-sm"
                      >
                        Done
                      </button>
                    </div>

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