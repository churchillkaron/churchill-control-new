"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    const res = await fetch("/api/orders");
    const data = await res.json();
    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // 🔥 MARK ORDER AS PAID (CRITICAL FOR REVENUE)
  const markPaid = async (id) => {
    await fetch("/api/orders/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id,
        status: "paid",
      }),
    });

    fetchOrders();
  };

  return (
    <AppShell>
      <div className="space-y-8 text-white">

        <h1 className="text-3xl">Orders</h1>

        {loading && <div className="text-white/50">Loading...</div>}

        {!loading && orders.length === 0 && (
          <div className="text-white/40">No orders yet</div>
        )}

        {!loading &&
          orders.map((order) => (
            <div
              key={order.id}
              className="bg-white/5 border border-white/10 rounded-xl p-4"
            >
              <div className="flex justify-between mb-2">
                <div>Table: {order.table}</div>
                <div>Status: {order.status}</div>
              </div>

              {order.items.map((item, i) => (
                <div key={i} className="text-sm text-white/70">
                  {item.name} — {item.price} THB
                </div>
              ))}

              <div className="mt-3 flex justify-between">
                <div>Total: {order.total} THB</div>

                {order.status !== "paid" && (
                  <button
                    onClick={() => markPaid(order.id)}
                    className="bg-green-600 px-3 py-1 rounded text-sm"
                  >
                    Mark Paid
                  </button>
                )}
              </div>
            </div>
          ))}

      </div>
    </AppShell>
  );
}