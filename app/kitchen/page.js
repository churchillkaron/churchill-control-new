"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [station, setStation] = useState("");

  useEffect(() => {
    const role = (localStorage.getItem("staffRole") || "").toUpperCase();

    if (role === "THAI") setStation("THAI");
    else if (role === "WESTERN") setStation("WESTERN");
    else if (role === "PIZZA") setStation("PIZZA");
    else if (role === "BAR") setStation("BAR");
    else setStation("WESTERN");
  }, []);

  const loadOrders = () => {
    try {
      const data = JSON.parse(localStorage.getItem("orders") || "[]");

      const filtered = data
        .map((order) => ({
          ...order,
          items: order.items.filter(
            (item) =>
              item.station === station &&
              item.status !== "READY" &&
              (!item.hold || order.fireNext)
          ),
        }))
        .filter((order) => order.items.length > 0);

      setOrders(filtered);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!station) return;

    loadOrders();
    const interval = setInterval(loadOrders, 1000);
    return () => clearInterval(interval);
  }, [station]);

  const updateStatus = (orderId, itemId, currentStatus) => {
    const all = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = all.map((order) => {
      if (order.id !== orderId) return order;

      return {
        ...order,
        items: order.items.map((item) => {
          if (item.id !== itemId) return item;

          if (currentStatus === "NEW") {
            return { ...item, status: "PREPARING" };
          }

          if (currentStatus === "PREPARING") {
            return { ...item, status: "READY" };
          }

          return item;
        }),
      };
    });

    localStorage.setItem("orders", JSON.stringify(updated));
    loadOrders();
  };

  const fireNextCourse = (orderId) => {
    const all = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = all.map((order) =>
      order.id === orderId ? { ...order, fireNext: true } : order
    );

    localStorage.setItem("orders", JSON.stringify(updated));
    loadOrders();
  };

  return (
    <AppShell>
      <div className="space-y-6">

        <div>
          <h1 className="text-4xl md:text-5xl font-semibold">
            {station} Kitchen
          </h1>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">

          {orders.length === 0 && (
            <div className="text-white/40">No active orders</div>
          )}

          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4"
            >
              <div>
                <div className="text-lg font-semibold">
                  Table {order.table}
                </div>
              </div>

              <button
                onClick={() => fireNextCourse(order.id)}
                className="w-full bg-white/10 py-2 rounded-xl text-sm"
              >
                Fire Held Items
              </button>

              <div className="space-y-3">
                {order.items.map((item) => (
                  <div
                    key={item.id}
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
                        updateStatus(order.id, item.id, item.status)
                      }
                      className="w-full mt-2 bg-[#ff7a00] py-2 rounded-xl text-black font-semibold"
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