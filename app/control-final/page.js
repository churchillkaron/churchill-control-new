"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ControlFinalPage() {
  const [orders, setOrders] = useState([]);
  const [adjustments, setAdjustments] = useState([]);

  // 🔥 LOAD DATA
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");
    setOrders(stored);

    // collect all requests
    const requests = stored.flatMap((o) =>
      (o.adjustmentRequests || []).map((r) => ({
        ...r,
        orderId: o.id,
        table: o.table,
      }))
    );

    setAdjustments(requests);
  }, []);

  // 🔥 APPROVE
  const approve = (id) => {
    setAdjustments((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, status: "approved", approvedBy: "manager" }
          : a
      )
    );
  };

  // 🔥 REJECT
  const reject = (id) => {
    setAdjustments((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, status: "rejected" }
          : a
      )
    );
  };

  // 🔥 CALCULATE
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

  return (
    <AppShell showNav={true}>
      <div className="text-white space-y-6">

        <h1>Control Final</h1>

        {/* 🔥 REVENUE */}
        <div className="bg-white/5 p-4 rounded space-y-2">
          <div>Subtotal: {subtotal}</div>
          <div>Discounts: -{discountTotal}</div>
          <div className="text-xl">Final Revenue: {finalRevenue}</div>
        </div>

        {/* 🔥 REQUESTS */}
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
                    onClick={() => approve(a.id)}
                    className="bg-green-500 px-2 py-1 rounded text-black"
                  >
                    APPROVE
                  </button>

                  <button
                    onClick={() => reject(a.id)}
                    className="bg-red-500 px-2 py-1 rounded"
                  >
                    REJECT
                  </button>
                </div>
              )}

            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}