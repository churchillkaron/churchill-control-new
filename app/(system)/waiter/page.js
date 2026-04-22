"use client";

import { useEffect, useState } from "react";

export default function WaiterPage() {
  const [orders, setOrders] = useState([]);

  const loadOrders = () => {
    const data = JSON.parse(localStorage.getItem("orders") || "[]");
    setOrders(data.reverse());
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 2000);
    return () => clearInterval(interval);
  }, []);

  const serveItem = (orderId, itemId) => {
    const data = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = data.map((order) => {
      if (order.id !== orderId) return order;

      return {
        ...order,
        items: order.items.map((item) =>
          item.id === itemId ? { ...item, status: "SERVED" } : item
        ),
      };
    });

    localStorage.setItem("orders", JSON.stringify(updated));
    loadOrders();
  };

  const renderOrders = () => {
    return orders.map((order) => {
      const readyItems = order.items.filter(
        (i) => i.status === "READY"
      );

      if (readyItems.length === 0) return null;

      return (
        <div key={order.id} className="bg-white/10 p-4 rounded-xl space-y-2">

          <div className="text-sm opacity-70">
            Table: {order.table}
          </div>

          {readyItems.map((item) => (
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

              <button
                onClick={() => serveItem(order.id, item.id)}
                className="px-3 py-1 bg-blue-500 rounded"
              >
                Serve
              </button>
            </div>
          ))}
        </div>
      );
    });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="text-xl">Ready to Serve</div>
      {renderOrders()}
    </div>
  );
}