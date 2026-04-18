"use client";

import { useEffect, useState } from "react";

export default function ControlFinalPage() {
  const [orders, setOrders] = useState([]);

  const loadOrders = () => {
    const data = JSON.parse(localStorage.getItem("orders") || "[]");

    // only fully served orders
    const served = data.filter((order) =>
      order.items.every((i) => i.status === "SERVED")
    );

    setOrders(served);
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 2000);
    return () => clearInterval(interval);
  }, []);

  const closeOrder = (orderId) => {
    let data = JSON.parse(localStorage.getItem("orders") || "[]");
    let history = JSON.parse(localStorage.getItem("history") || "[]");

    const remaining = [];

    data.forEach((order) => {
      if (order.id === orderId) {
        history.push({
          ...order,
          closed_at: new Date().toISOString(),
        });
      } else {
        remaining.push(order);
      }
    });

    localStorage.setItem("orders", JSON.stringify(remaining));
    localStorage.setItem("history", JSON.stringify(history));

    loadOrders();
  };

  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="p-6 space-y-6">

      <div className="text-2xl">Control Final</div>

      <div className="text-xl">
        Revenue Ready: {totalRevenue} THB
      </div>

      {orders.map((order) => (
        <div key={order.id} className="bg-white/10 p-4 rounded-xl space-y-2">

          <div className="flex justify-between">
            <div>Table: {order.table}</div>
            <div>{order.total} THB</div>
          </div>

          <div className="text-sm opacity-70">
            {order.items.length} items
          </div>

          <button
            onClick={() => closeOrder(order.id)}
            className="w-full bg-green-600 p-2 rounded"
          >
            Close Order
          </button>
        </div>
      ))}
    </div>
  );
}