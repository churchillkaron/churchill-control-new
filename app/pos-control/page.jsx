"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

const STATUS_FLOW = ["Active", "Preparing", "Served", "Paid"];

export default function POSControl() {
  const [orders, setOrders] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const loadOrders = () => {
      const saved = JSON.parse(localStorage.getItem("orders")) || [];
      setOrders(saved);
    };

    loadOrders();

    const interval = setInterval(loadOrders, 1000);
    return () => clearInterval(interval);
  }, []);

  const saveOrders = (updatedOrders) => {
    localStorage.setItem("orders", JSON.stringify(updatedOrders));
    setOrders(updatedOrders);
  };

  const advanceStatus = (orderId) => {
    const updatedOrders = orders.map((order) => {
      if (order.id !== orderId) return order;

      const currentIndex = STATUS_FLOW.indexOf(order.status);
      const nextIndex =
        currentIndex >= 0 && currentIndex < STATUS_FLOW.length - 1
          ? currentIndex + 1
          : currentIndex;

      const nextStatus =
        currentIndex === -1 ? "Active" : STATUS_FLOW[nextIndex];

      return {
        ...order,
        status: nextStatus,
      };
    });

    saveOrders(updatedOrders);
  };

  const toggleExpanded = (orderId) => {
    setExpandedId((prev) => (prev === orderId ? null : orderId));
  };

  const getNextStatusLabel = (status) => {
    const currentIndex = STATUS_FLOW.indexOf(status);

    if (currentIndex === -1) return "Move to Active";
    if (currentIndex >= STATUS_FLOW.length - 1) return "Completed";

    return `Move to ${STATUS_FLOW[currentIndex + 1]}`;
  };

  return (
    <AppShell>
      <div className="space-y-10">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            POS Control
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Live Orders
          </h1>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 bg-[#ff7a00]/10 blur-2xl rounded-3xl" />

          <div className="relative rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-2xl p-6 md:p-8 shadow-[0_25px_80px_rgba(0,0,0,0.6)]">
            {orders.length === 0 && (
              <div className="text-white/40">No orders yet</div>
            )}

            <div className="space-y-4">
              {orders.map((order) => {
                const isExpanded = expandedId === order.id;
                const isPaid = order.status === "Paid";

                return (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden"
                  >
                    <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(order.id)}
                        className="text-left"
                      >
                        <div className="font-semibold">
                          Table {order.table}
                        </div>
                        <div className="text-white/50 text-sm">
                          {order.items.length} items
                        </div>
                      </button>

                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="font-semibold">THB {order.total}</div>

                        <div className="text-[#ffb36b] min-w-[80px] text-center">
                          {order.status}
                        </div>

                        <button
                          type="button"
                          onClick={() => advanceStatus(order.id)}
                          disabled={isPaid}
                          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                            isPaid
                              ? "bg-white/10 text-white/35 cursor-not-allowed"
                              : "bg-[#ff7a00] text-black hover:scale-[1.02]"
                          }`}
                        >
                          {getNextStatusLabel(order.status)}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-white/10 px-4 py-4 space-y-3 bg-white/[0.03]">
                        {order.items.map((item, index) => (
                          <div
                            key={`${order.id}-${index}`}
                            className="flex items-center justify-between rounded-xl bg-black/30 px-4 py-3"
                          >
                            <div>{item.name}</div>
                            <div className="text-white/70">THB {item.price}</div>
                          </div>
                        ))}

                        <div className="flex items-center justify-between pt-2 text-sm text-white/50">
                          <div>{new Date(order.time).toLocaleString()}</div>
                          <div>Total: THB {order.total}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}