"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ControlFinalPage() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = () => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");
    setOrders(stored);
  };

  const saveOrders = (updatedOrders) => {
    localStorage.setItem("orders", JSON.stringify(updatedOrders));
    setOrders(updatedOrders);
  };

  // 🔥 APPROVE
  const approve = (orderId, adjId) => {
    const updated = orders.map((o) => {
      if (o.id !== orderId) return o;

      return {
        ...o,
        adjustmentRequests: (o.adjustmentRequests || []).map((a) =>
          a.id === adjId
            ? {
                ...a,
                status: "approved",
                approvedBy: "manager",
                approved_at: new Date().toISOString(),
              }
            : a
        ),
      };
    });

    saveOrders(updated);
  };

  // 🔥 REJECT
  const reject = (orderId, adjId) => {
    const updated = orders.map((o) => {
      if (o.id !== orderId) return o;

      return {
        ...o,
        adjustmentRequests: (o.adjustmentRequests || []).map((a) =>
          a.id === adjId
            ? {
                ...a,
                status: "rejected",
              }
            : a
        ),
      };
    });

    saveOrders(updated);
  };

  // 🔥 FLATTEN
  const adjustments = orders.flatMap((o) =>
    (o.adjustmentRequests || []).map((a) => ({
      ...a,
      orderId: o.id,
      table: o.table,
    }))
  );

  // 🔥 CALCULATIONS
  const subtotal = orders.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => s + i.price, 0),
    0
  );

  const discountTotal = adjustments.reduce((sum, a) => {
    if (a.status !== "approved") return sum;

    if (a.type === "discount") {
      if (a.mode === "percent") {
        return sum + (subtotal * a.value) / 100;
      }
      return sum + a.value;
    }

    if (a.type === "comp") {
      return sum + a.value;
    }

    return sum;
  }, 0);

  const finalRevenue = subtotal - discountTotal;

  // 🔥 SAVE DAY
  const saveDay = () => {
    const history = JSON.parse(localStorage.getItem("history") || "[]");

    const newDay = {
      id: Date.now(),
      date: new Date().toISOString(),

      orders,
      adjustments,

      subtotal,
      discountTotal,
      finalRevenue,

      created_at: new Date().toISOString(),
    };

    history.push(newDay);

    localStorage.setItem("history", JSON.stringify(history));

    // 🔥 RESET ORDERS AFTER CLOSE
    localStorage.removeItem("orders");

    alert("Day Closed & Saved");

    setOrders([]);
  };

  return (
    <AppShell showNav={true}>
      <div className="text-white space-y-6">

        <h1>Control Final</h1>

        {/* REVENUE */}
        <div className="bg-white/5 p-4 rounded space-y-2">
          <div>Subtotal: {subtotal}</div>
          <div>Discounts: -{discountTotal}</div>
          <div className="text-xl">Final Revenue: {finalRevenue}</div>
        </div>

        {/* REQUESTS */}
        <div className="space-y-3">
          <h2>Adjustment Requests</h2>

          {adjustments.map((a) => (
            <div key={a.id} className="bg-white/5 p-3 rounded space-y-1">

              <div>
                Table {a.table} | {a.type} {a.value}
              </div>

              <div className="text-xs text-white/50">
                by {a.requestedBy}
              </div>

              <div>Status: {a.status}</div>

              {a.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => approve(a.orderId, a.id)}
                    className="bg-green-500 px-2 py-1 rounded text-black"
                  >
                    APPROVE
                  </button>

                  <button
                    onClick={() => reject(a.orderId, a.id)}
                    className="bg-red-500 px-2 py-1 rounded"
                  >
                    REJECT
                  </button>
                </div>
              )}

            </div>
          ))}
        </div>

        {/* 🔥 CLOSE DAY */}
        <button
          onClick={saveDay}
          className="w-full bg-orange-500 py-3 rounded text-black text-lg"
        >
          CLOSE DAY
        </button>

      </div>
    </AppShell>
  );
}