"use client";

import { useEffect, useState } from "react";

export default function Kitchen() {
  const [orders, setOrders] = useState([]);

  const loadOrders = () => {
    const data = JSON.parse(localStorage.getItem("orders")) || [];
    setOrders(data.filter((o) => o.status !== "Paid"));
  };

  useEffect(() => {
    loadOrders();

    const interval = setInterval(loadOrders, 1000);
    return () => clearInterval(interval);
  }, []);

  const updateStatus = (id) => {
    const updated = orders.map((o) => {
      if (o.id !== id) return o;

      let next = o.status;

      if (o.status === "Active") next = "Preparing";
      else if (o.status === "Preparing") next = "Served";

      return { ...o, status: next };
    });

    localStorage.setItem("orders", JSON.stringify(updated));
    setOrders(updated);
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 space-y-6">

      <h1 className="text-3xl font-semibold">
        Kitchen Screen
      </h1>

      <div className="grid md:grid-cols-3 gap-6">

        {orders.map((order) => (
          <div
            key={order.id}
            className="bg-white/10 p-4 rounded-xl"
          >

            <div className="flex justify-between mb-2">
              <div>Table {order.table}</div>
              <div className="text-[#ff7a00]">{order.status}</div>
            </div>

            <div className="space-y-1 text-sm mb-3">
              {order.items.map((item, i) => (
                <div key={i}>
                  {item.name} x{item.qty || 1}
                </div>
              ))}
            </div>

            <button
              onClick={() => updateStatus(order.id)}
              className="w-full bg-[#ff7a00] py-2 rounded-xl text-black"
            >
              Next Step
            </button>

          </div>
        ))}

      </div>

    </div>
  );
}