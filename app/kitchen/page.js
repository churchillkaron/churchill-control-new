"use client";

import { useEffect, useState, useRef } from "react";
import AppShell from "../AppShell";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [now, setNow] = useState(Date.now());
  const alertedRef = useRef({});

  const loadOrders = () => {
    const data = JSON.parse(localStorage.getItem("orders") || "[]");
    setOrders(data.reverse());
  };

  useEffect(() => {
    loadOrders();

    const interval = setInterval(() => {
      processOrders();
      setNow(Date.now());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const processOrders = () => {
    let data = JSON.parse(localStorage.getItem("orders") || "[]");
    let history = JSON.parse(localStorage.getItem("history") || "[]");

    const active = [];

    data.forEach((order) => {
      const allReady = order.items.every((i) => i.status === "READY");

      if (allReady) {
        history.push({
          ...order,
          completed_at: new Date().toISOString(),
        });
      } else {
        active.push(order);
      }
    });

    localStorage.setItem("orders", JSON.stringify(active));
    localStorage.setItem("history", JSON.stringify(history));

    setOrders(active.reverse());
  };

  const updateStatus = (orderId, itemId, newStatus) => {
    const data = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = data.map((order) => {
      if (order.id !== orderId) return order;

      return {
        ...order,
        items: order.items.map((item) =>
          item.id === itemId ? { ...item, status: newStatus } : item
        ),
      };
    });

    localStorage.setItem("orders", JSON.stringify(updated));
  };

  const getTimer = (created_at) => {
    const diff = Math.floor((now - new Date(created_at)) / 1000);
    return Math.floor(diff / 60);
  };

  const getColor = (minutes) => {
    if (minutes < 5) return "bg-green-500";
    if (minutes < 10) return "bg-yellow-500";
    return "bg-red-600";
  };

  const playAlert = () => {
    const audio = new Audio("/alert.mp3");
    audio.play();
  };

  const renderStation = (station) => {
    return orders.map((order) => {
      const items = order.items.filter((i) => i.station === station);
      if (items.length === 0) return null;

      const minutes = getTimer(order.created_at);

      if (minutes >= 10 && !alertedRef.current[order.id]) {
        playAlert();
        alertedRef.current[order.id] = true;
      }

      return (
        <div key={order.id} className="bg-white/10 p-4 rounded-xl space-y-2">

          <div className="flex justify-between text-sm opacity-70">
            <div>Table: {order.table}</div>
            <div className={`px-2 rounded ${getColor(minutes)}`}>
              {minutes} min
            </div>
          </div>

          {items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-center bg-black/40 p-2 rounded"
            >
              <div>
                <div>{item.name}</div>
                {item.modifier && <div>• {item.modifier}</div>}
                {item.side && <div>• {item.side}</div>}
                {item.sauce && <div>• {item.sauce}</div>}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() =>
                    updateStatus(order.id, item.id, "PREPARING")
                  }
                  className="px-2 py-1 bg-yellow-500 rounded"
                >
                  Prep
                </button>

                <button
                  onClick={() =>
                    updateStatus(order.id, item.id, "READY")
                  }
                  className="px-2 py-1 bg-green-500 rounded"
                >
                  Ready
                </button>
              </div>
            </div>
          ))}
        </div>
      );
    });
  };

  return (
    <AppShell>
      <div className="p-6 grid grid-cols-2 gap-6">

        <div className="space-y-4">
          <div className="text-xl">WESTERN</div>
          {renderStation("WESTERN")}
        </div>

        <div className="space-y-4">
          <div className="text-xl">THAI</div>
          {renderStation("THAI")}
        </div>

      </div>
    </AppShell>
  );
}