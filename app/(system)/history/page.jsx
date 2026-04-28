"use client";

import { useEffect, useState } from "react";


export default function HistoryPage() {
  const [history, setHistory] = useState([]);

  // 🔥 LOAD HISTORY
 useEffect(() => {
  const loadHistory = async () => {
    const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

    const { data, error } = await supabase
      .from("history_days")
      .select("*")
      .eq("tenant_id", tenant_id)
      .order("date", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setHistory(data || []);
  };

  loadHistory();
}, []);

  return (

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
   
  );
}