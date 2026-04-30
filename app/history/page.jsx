"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function HistoryPage() {
  const [history, setHistory] = useState([]);

  // 🔥 LOAD HISTORY
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("history") || "[]");
    setHistory(stored.reverse()); // latest first
  }, []);

  return (
    <AppShell showNav={true}>
      <div className="text-white space-y-6">

        <h1>History</h1>

        {history.length === 0 && (
          <div className="text-white/50">No saved days yet</div>
        )}

        {history.map((day) => (
          <div key={day.id} className="bg-white/5 p-4 rounded space-y-3">

            {/* 🔥 HEADER */}
            <div className="flex justify-between">
              <div>
                {new Date(day.date).toLocaleDateString()}
              </div>
              <div className="text-white/50 text-sm">
                {day.orders.length} orders
              </div>
            </div>

            {/* 🔥 FINANCIALS */}
            <div className="space-y-1 text-sm">
              <div>Subtotal: {day.subtotal}</div>
              <div>Discounts: -{day.discountTotal}</div>
              <div className="text-lg">Revenue: {day.finalRevenue}</div>
            </div>

            {/* 🔥 ADJUSTMENTS */}
            {day.adjustments.length > 0 && (
              <div className="space-y-1 text-xs text-white/60">
                <div className="text-white">Adjustments:</div>

                {day.adjustments.map((a) => (
                  <div key={a.id}>
                    Table {a.table} | {a.type} {a.value} | {a.status}
                  </div>
                ))}
              </div>
            )}

          </div>
        ))}

      </div>
    </AppShell>
  );
}