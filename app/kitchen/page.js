"use client";

import { useEffect, useState } from "react";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [now, setNow] = useState(Date.now());

  const loadOrders = () => {
    const data = JSON.parse(localStorage.getItem("orders") || "[]");
    setOrders(data.reverse());
  };

  useEffect(() => {
    loadOrders();

    const interval = setInterval(() => {
      loadOrders();
      setNow(Date.now()); // 🔥 live timer update
    }, 2000);

    return () => clearInterval(interval);
  }, []);

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
    loadOrders();
  };

  // 🔥 TIME + COLOR LOGIC
  const getTimer = (created_at) => {
    const diff = Math.floor((now - new Date(created_at)) / 1000);
    const minutes = Math.floor(diff / 60);
    return minutes;
  };

  const getColor = (minutes) => {
    if (minutes < 5) return "bg-green-500";
    if (minutes < 10) return "bg-yellow-500";
    return "bg-red-600";
  };

  const renderStation = (station) => {
    return orders.map((order) => {
      const items = order.items.filter((i) => i.station === station);

      if (items.length === 0) return null;

      const minutes = getTimer(order.created_at);

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
  );
}