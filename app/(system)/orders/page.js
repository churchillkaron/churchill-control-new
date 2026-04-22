"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell.js";

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();
      setOrders(data);
    } catch (err) {
      console.error("Failed to load orders");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const markPaid = async (id) => {
    try {
      const res = await fetch("/api/orders/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to update");
        return;
      }

      // 🔥 REFRESH AFTER UPDATE
      fetchOrders();

    } catch (err) {
      alert("Error updating order");
    }
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Orders</h1>

        {loading && (
          <div className="text-white/50">Loading...</div>
        )}

        {!loading && orders.length === 0 && (
          <div className="text-white/50">No orders</div>
        )}

        {!loading &&
          orders.map((order) => (
            <div
              key={order.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3"
            >
              <div className="flex justify-between">
                <div>Table: {order.table}</div>
                <div className="text-sm text-white/50">
                  {order.status}
                </div>
              </div>

              {order.items.map((item, i) => (
                <div
                  key={i}
                  className="flex justify-between text-sm"
                >
                  <span>{item.name}</span>
                  <span>{item.price} THB</span>
                </div>
              ))}

              <div className="border-t border-white/10 pt-2 flex justify-between">
                <span>Total</span>
                <span>{order.total} THB</span>
              </div>

              {order.status !== "paid" && (
                <button
                  onClick={() => markPaid(order.id)}
                  className="mt-3 bg-[#ff7a00] px-4 py-2 rounded-xl"
                >
                  Mark Paid
                </button>
              )}
            </div>
          ))}

      </div>
    </AppShell>
  );
}