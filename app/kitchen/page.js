"use client";
import { useEffect, useState } from "react";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("orders")) || [];
    setOrders(stored);
  }, []);

  const updateOrders = (updated) => {
    setOrders(updated);
    localStorage.setItem("orders", JSON.stringify(updated));
  };

  // 🔁 RECALL (already working)
  const recallItem = (itemId) => {
    const updated = orders.map((order) => ({
      ...order,
      items: order.items.map((item) =>
        item.id === itemId ? { ...item, status: "COOKING" } : item
      ),
    }));
    updateOrders(updated);
  };

  // ❌ CANCEL (NEW)
  const cancelItem = (itemId) => {
    const updated = orders.map((order) => ({
      ...order,
      items: order.items.map((item) =>
        item.id === itemId
          ? { ...item, status: "CANCELLED" }
          : item
      ),
    }));
    updateOrders(updated);
  };

  // FILTER BY STATION
  const getItemsByStation = (station) => {
    return orders
      .flatMap((order) =>
        order.items
          .filter(
            (item) =>
              item.station === station &&
              item.status !== "CANCELLED"
          )
          .map((item) => ({
            ...item,
            table: order.table,
            ticketTime: order.createdAt,
          }))
      );
  };

  const stations = ["THAI", "WESTERN", "PIZZA"];

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl mb-6">Kitchen</h1>

      <div className="grid grid-cols-3 gap-6">
        {stations.map((station) => (
          <div key={station}>
            <h2 className="mb-2 text-sm opacity-70">{station}</h2>

            <div className="space-y-3">
              {getItemsByStation(station).map((item) => (
                <div
                  key={item.id}
                  className="border border-white/20 p-3 rounded bg-red-900/40"
                >
                  <div className="text-sm">
                    Table {item.table}
                  </div>

                  <div className="text-xs opacity-70 mb-1">
                    {item.name}
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span>{item.status}</span>

                    {/* RECALL */}
                    {item.status === "DONE" && (
                      <button
                        onClick={() => recallItem(item.id)}
                        className="bg-yellow-500 px-2 py-0.5 rounded text-black"
                      >
                        Recall
                      </button>
                    )}

                    {/* CANCEL */}
                    {item.status !== "CANCELLED" && (
                      <button
                        onClick={() => cancelItem(item.id)}
                        className="bg-red-600 px-2 py-0.5 rounded"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}