"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function POSControl() {
  const [orders, setOrders] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  // 🔥 loadOrders → unified loader
  const loadOrders = () => {
    const saved = JSON.parse(localStorage.getItem("orders") || "[]");
    setOrders(saved);
  };

  useEffect(() => {
    loadOrders();

    // 🔥 REAL-TIME SYNC (same tab + cross tab)
    const handleStorageChange = () => loadOrders();
    window.addEventListener("storage", handleStorageChange);

    const interval = setInterval(loadOrders, 500); // fallback real-time
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // 🔥 calculateOrderStatus → derived from items
  const calculateOrderStatus = (order) => {
    if (order.items.every((i) => i.status === "READY")) return "READY";
    if (order.items.some((i) => i.status === "PREPARING")) return "PREPARING";
    return "ACTIVE";
  };

  // 🔥 markAsPaid → final step
  const markAsPaid = (orderId) => {
    const updated = orders.map((order) =>
      order.id === orderId
        ? { ...order, status: "PAID", paidAt: new Date().toISOString() }
        : order
    );

    localStorage.setItem("orders", JSON.stringify(updated));
    setOrders(updated);
  };

  // 🔥 toggleExpanded → UI control
  const toggleExpanded = (orderId) => {
    setExpandedId((prev) => (prev === orderId ? null : orderId));
  };

  const sortedOrders = [...orders].sort((a, b) => b.id - a.id);

  const activeOrders = sortedOrders.filter((o) => o.status !== "PAID");
  const paidOrders = sortedOrders.filter((o) => o.status === "PAID");

  return (
   
      <div className="space-y-10">

        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            POS Control
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Live Orders
          </h1>
        </div>

        {/* ACTIVE */}
        <div className="space-y-4">
          {activeOrders.map((order) => {
            const isExpanded = expandedId === order.id;
            const status = calculateOrderStatus(order);

            return (
              <div
                key={order.id}
                className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden"
              >
                <div className="flex justify-between p-4 items-center">

                  <button onClick={() => toggleExpanded(order.id)}>
                    <div className="font-semibold">Table {order.table}</div>
                    <div className="text-white/50 text-sm">
                      {order.items.length} items
                    </div>
                  </button>

                  <div className="flex items-center gap-4">
                    <div>THB {order.total}</div>
                    <div className="text-[#ffb36b]">{status}</div>

                    <button
                      onClick={() => markAsPaid(order.id)}
                      className="bg-[#ff7a00] px-4 py-2 rounded-xl text-black"
                    >
                      Mark Paid
                    </button>
                  </div>

                </div>

                {isExpanded && (
                  <div className="p-4 space-y-2">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between">
                        <span>
                          {item.name} x{item.qty}
                        </span>
                        <span>THB {item.price}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* PAID */}
        {paidOrders.length > 0 && (
          <div className="pt-10 space-y-4">
            <h2 className="text-xl text-white/60">Completed / Paid</h2>

            {paidOrders.map((order) => (
              <div
                key={order.id}
                className="rounded-2xl border border-white/5 bg-black/20 p-4 flex justify-between opacity-60"
              >
                <div>
                  Table {order.table} — {order.items.length} items
                </div>
                <div>THB {order.total}</div>
              </div>
            ))}
          </div>
        )}

      </div>
  
  );
}