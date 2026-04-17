"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

const STATUS_FLOW = ["Active", "Preparing", "Served", "Paid"];

export default function POSControl() {
  const [orders, setOrders] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  // LOAD + SYNC ORDERS
  useEffect(() => {
    const loadOrders = () => {
      const saved = JSON.parse(localStorage.getItem("orders")) || [];
      setOrders(saved);
    };

    loadOrders();

    // 🔥 REAL-TIME SYNC (no polling)
    const handleStorageChange = () => {
      loadOrders();
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const saveOrders = (updatedOrders) => {
    localStorage.setItem("orders", JSON.stringify(updatedOrders));
    setOrders(updatedOrders);
  };

  const savePaidOrderToHistoryDay = (paidOrder) => {
    const raw = localStorage.getItem("history_day");
    const existing = raw ? JSON.parse(raw) : { revenue: 0, paidOrders: [] };

    const alreadyExists = existing.paidOrders.some(
      (o) => o.id === paidOrder.id
    );

    if (alreadyExists) return;

    const updated = {
      revenue: (existing.revenue || 0) + paidOrder.total,
      paidOrders: [...existing.paidOrders, paidOrder],
      lastUpdated: new Date().toISOString(),
    };

    localStorage.setItem("history_day", JSON.stringify(updated));
  };

  const advanceStatus = (orderId) => {
    let paidOrder = null;

    const updatedOrders = orders.map((order) => {
      if (order.id !== orderId) return order;

      const currentIndex = STATUS_FLOW.indexOf(order.status);
      const nextIndex =
        currentIndex >= 0 && currentIndex < STATUS_FLOW.length - 1
          ? currentIndex + 1
          : currentIndex;

      const nextStatus =
        currentIndex === -1 ? "Active" : STATUS_FLOW[nextIndex];

      const updatedOrder = {
        ...order,
        status: nextStatus,
      };

      if (nextStatus === "Paid") {
        paidOrder = {
          ...updatedOrder,
          paidAt: new Date().toISOString(),
        };
      }

      return updatedOrder;
    });

    saveOrders(updatedOrders);

    if (paidOrder) {
      savePaidOrderToHistoryDay(paidOrder);
    }
  };

  const toggleExpanded = (orderId) => {
    setExpandedId((prev) => (prev === orderId ? null : orderId));
  };

  const getNextStatusLabel = (status) => {
    const index = STATUS_FLOW.indexOf(status);
    if (index === -1) return "Move to Active";
    if (index >= STATUS_FLOW.length - 1) return "Completed";
    return `Move to ${STATUS_FLOW[index + 1]}`;
  };

  // 🔥 SORT: newest first
  const sortedOrders = [...orders].sort((a, b) => b.id - a.id);

  // 🔥 SPLIT ACTIVE / PAID
  const activeOrders = sortedOrders.filter((o) => o.status !== "Paid");
  const paidOrders = sortedOrders.filter((o) => o.status === "Paid");

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

        {/* 🔥 ACTIVE ORDERS */}
        <div className="space-y-4">
          {activeOrders.map((order) => {
            const isExpanded = expandedId === order.id;

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

                    <div className="text-[#ffb36b]">{order.status}</div>

                    <button
                      onClick={() => advanceStatus(order.id)}
                      className="bg-[#ff7a00] px-4 py-2 rounded-xl text-black"
                    >
                      {getNextStatusLabel(order.status)}
                    </button>
                  </div>

                </div>

                {isExpanded && (
                  <div className="p-4 space-y-2">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between">
                        <span>
                          {item.name} x{item.qty || 1}
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

        {/* 🔥 PAID SECTION */}
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
    </AppShell>
  );
}