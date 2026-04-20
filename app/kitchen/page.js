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

  // 🔥 UPDATE STATUS
  const updateItemStatus = (orderId, itemIds, newStatus) => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = stored.map((order) => {
      if (order.id !== orderId) return order;

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

  // 🔥 CANCEL ITEM
  const cancelItems = (orderId, itemIds) => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = stored.map((order) => {
      if (order.id !== orderId) return order;

      const remainingItems = order.items.filter(
        (item) => !itemIds.includes(item.id)
      );

      return {
        ...order,
        items: remainingItems,
        total: remainingItems.reduce((s, i) => s + i.price, 0),
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
      };
    });

    localStorage.setItem("orders", JSON.stringify(updated));
    loadOrders();
  };

  const fireDessert = (orderId) => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = stored.map((order) => {
      if (order.id !== orderId) return order;

      return {
        ...order,
        dessertFired: true,
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
              const mainDone = order.items
                .filter((i) => i.course === "main")
                .every((i) => i.status === "DONE");

              const items = order.items.filter((item) => {
                if (item.station !== station) return false;

                if (
                  item.course === "dessert" &&
                  !mainDone &&
                  !order.dessertFired
                )
                  return false;

                return true;
              });

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
              <div key={station} className="space-y-4">
                <h2>{station}</h2>

                {Object.entries(grouped).map(([table, orders]) => (
                  <div key={table} className="border p-3 space-y-3">
                    <div>Table {table}</div>

                    {orders.map((order, index) => {
                      const minutes = getWaitingTime(order.created_at);
                      const urgencyStyle = getUrgencyStyle(minutes);

                      const allDone = order.items.every(
                        (i) => i.status === "DONE"
                      );

                      const mainDone = order.items
                        .filter((i) => i.course === "main")
                        .every((i) => i.status === "DONE");

                      const merged = {};

                      order.stationItems.forEach((item) => {
                        if (!merged[item.name]) {
                          merged[item.name] = {
                            name: item.name,
                            ids: [],
                          };
                        }

                        merged[item.name].ids.push(item.id);
                      });

                      return (
                        <div key={order.id} className={urgencyStyle}>
                          <div>Ticket {index + 1} • {minutes} min</div>

                          {!mainDone && (
                            <button onClick={() => fireDessert(order.id)}>
                              FIRE DESSERT
                            </button>
                          )}

                          {Object.values(merged).map((item) => (
                            <div key={item.name}>
                              {item.ids.length}x {item.name}

                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    updateItemStatus(order.id, item.ids, "COOKING")
                                  }
                                >
                                  Cooking
                                </button>

                                <button
                                  onClick={() =>
                                    updateItemStatus(order.id, item.ids, "DONE")
                                  }
                                >
                                  Done
                                </button>

                                <button
                                  onClick={() =>
                                    updateItemStatus(order.id, item.ids, "COOKING")
                                  }
                                >
                                  Recall
                                </button>

                                {/* 🔥 CANCEL */}
                                <button
                                  onClick={() =>
                                    cancelItems(order.id, item.ids)
                                  }
                                  className="bg-red-600 px-2"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ))}

                          {allDone && (
                            <button onClick={() => serveOrder(order.id)}>
                              Serve
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