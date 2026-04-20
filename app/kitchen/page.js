"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "../AppShell";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const prevOrderIds = useRef([]);

  const playSound = () => {
    const audio = new Audio("/notification.mp3"); // 🔥 place file in /public
    audio.play().catch(() => {});
  };

  const loadOrders = () => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");
    const kitchenOrders = stored.filter((o) => o.status === "kitchen");

    const newIds = kitchenOrders.map((o) => o.id);

    // 🔥 detect new orders
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

  const updateItemStatus = (orderId, itemId, newStatus) => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = stored.map((order) => {
      if (order.id !== orderId) return order;
      if (order.status !== "kitchen") return order;

      return {
        ...order,
        items: order.items.map((item) =>
          item.id === itemId
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
    const created = new Date(created_at).getTime();
    return Math.floor((Date.now() - created) / 60000);
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
            const stationOrders = orders
              .map((order) => ({
                ...order,
                stationItems: order.items.filter(
                  (item) => item.station === station
                ),
              }))
              .filter((order) => order.stationItems.length > 0);

            return (
              <div
                key={station}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4"
              >
                <div className="text-lg">{station}</div>

                {stationOrders.length === 0 && (
                  <div className="text-white/40 text-sm">
                    No orders
                  </div>
                )}

                {stationOrders.map((order) => {
                  const allDone = order.items.every(
                    (item) => item.status === "DONE"
                  );

                  const minutes = getWaitingTime(order.created_at);
                  const urgencyStyle = getUrgencyStyle(minutes);

                  return (
                    <div
                      key={order.id}
                      className={`border rounded-xl p-4 space-y-3 ${urgencyStyle}`}
                    >
                      <div className="flex justify-between">
                        <div>Table: {order.table}</div>
                        <div className="text-xs text-white/50">
                          {minutes} min
                        </div>
                      </div>

                      {order.stationItems.map((item) => (
                        <div key={item.id} className="bg-black/30 p-3 rounded-xl">
                          <div>{item.name}</div>

                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() =>
                                updateItemStatus(order.id, item.id, "COOKING")
                              }
                              className="px-3 py-1 bg-yellow-500 text-black rounded"
                            >
                              Cooking
                            </button>

                            <button
                              onClick={() =>
                                updateItemStatus(order.id, item.id, "DONE")
                              }
                              className="px-3 py-1 bg-green-500 text-black rounded"
                            >
                              Done
                            </button>
                          </div>

                          <div className="text-xs text-white/50 mt-1">
                            {item.status}
                          </div>
                        </div>
                      ))}

                      {allDone && (
                        <button
                          onClick={() => serveOrder(order.id)}
                          className="w-full bg-blue-500 py-2 rounded-xl text-black"
                        >
                          Serve Order
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}