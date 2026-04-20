"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "../AppShell";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const prevOrderIds = useRef([]);

  const playSound = () => {
    const audio = new Audio("/notification.mp3");
    audio.play().catch(() => {});
  };

  const loadOrders = () => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    let kitchenOrders = stored.filter((o) => o.status === "kitchen");

    kitchenOrders = kitchenOrders.sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    const newIds = kitchenOrders.map((o) => o.id);

    if (prevOrderIds.current.length > 0) {
      const hasNew = newIds.some(
        (id) => !prevOrderIds.current.includes(id)
      );
      if (hasNew) playSound();
    }

    prevOrderIds.current = newIds;
    setOrders(kitchenOrders);
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 1000);
    return () => clearInterval(interval);
  }, []);

  const updateItemStatus = (orderId, itemIds, newStatus) => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = stored.map((order) => {
      if (order.id !== orderId) return order;
      if (order.status !== "kitchen") return order;

      return {
        ...order,
        items: order.items.map((item) =>
          itemIds.includes(item.id)
            ? { ...item, status: newStatus }
            : item
        ),
      };
    });

    localStorage.setItem("orders", JSON.stringify(updated));
    loadOrders();
  };

  const serveOrder = (orderId) => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = stored.map((order) => {
      if (order.id !== orderId) return order;

      return {
        ...order,
        status: "served",
        served_at: new Date().toISOString(),
      };
    });

    localStorage.setItem("orders", JSON.stringify(updated));
    loadOrders();
  };

  const getWaitingTime = (created_at) => {
    return Math.floor((Date.now() - new Date(created_at)) / 60000);
  };

  const getUrgencyStyle = (minutes) => {
    if (minutes >= 20) return "border-red-500 bg-red-500/10";
    if (minutes >= 10) return "border-yellow-500 bg-yellow-500/10";
    return "border-white/10 bg-white/5";
  };

  const stations = ["THAI", "WESTERN", "PIZZA"];

  return (
    <AppShell showNav={false}>
      <div className="space-y-10 text-white">
        <h1 className="text-3xl">Kitchen</h1>

        <div className="grid md:grid-cols-3 gap-6">
          {stations.map((station) => {
            const grouped = {};

            orders.forEach((order) => {
              const items = order.items.filter(
                (i) => i.station === station
              );

              if (items.length === 0) return;

              if (!grouped[order.table]) {
                grouped[order.table] = [];
              }

              grouped[order.table].push({
                ...order,
                stationItems: items,
              });
            });

            return (
              <div
                key={station}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4"
              >
                <div className="text-lg">{station}</div>

                {Object.keys(grouped).length === 0 && (
                  <div className="text-white/40 text-sm">
                    No orders
                  </div>
                )}

                {Object.entries(grouped).map(([table, orders]) => (
                  <div
                    key={table}
                    className="border border-white/10 rounded-xl p-4 space-y-4"
                  >
                    <div className="text-sm text-white/50">
                      Table {table}
                    </div>

                    {/* 🔥 EACH ORDER = ONE TICKET */}
                    {orders.map((order, index) => {
                      const minutes = getWaitingTime(order.created_at);
                      const urgencyStyle = getUrgencyStyle(minutes);

                      const allDone = order.items.every(
                        (i) => i.status === "DONE"
                      );

                      // merge items inside ticket
                      const merged = {};

                      order.stationItems.forEach((item) => {
                        const key = item.name;

                        if (!merged[key]) {
                          merged[key] = {
                            name: item.name,
                            ids: [],
                          };
                        }

                        merged[key].ids.push(item.id);
                      });

                      return (
                        <div
                          key={order.id}
                          className={`p-3 rounded-xl space-y-2 ${urgencyStyle}`}
                        >
                          {/* 🔥 COURSE LABEL */}
                          <div className="text-xs text-white/40">
                            Ticket {index + 1} • {minutes} min
                          </div>

                          {Object.values(merged).map((item) => (
                            <div
                              key={item.name}
                              className="bg-black/30 p-2 rounded"
                            >
                              <div>
                                {item.ids.length}x {item.name}
                              </div>

                              <div className="flex gap-2 mt-1">
                                <button
                                  onClick={() =>
                                    updateItemStatus(order.id, item.ids, "COOKING")
                                  }
                                  className="px-2 py-1 bg-yellow-500 text-black text-xs rounded"
                                >
                                  Cooking
                                </button>

                                <button
                                  onClick={() =>
                                    updateItemStatus(order.id, item.ids, "DONE")
                                  }
                                  className="px-2 py-1 bg-green-500 text-black text-xs rounded"
                                >
                                  Done
                                </button>
                              </div>
                            </div>
                          ))}

                          {allDone && (
                            <button
                              onClick={() => serveOrder(order.id)}
                              className="w-full bg-blue-500 py-1 rounded text-black text-sm"
                            >
                              Serve Ticket
                            </button>
                          )}
                        </div>
                      );
                    })}
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