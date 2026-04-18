"use client";

import { useEffect, useState } from "react";

export default function HistoryPage() {
  const [history, setHistory] = useState([]);

  const loadHistory = () => {
    const data = JSON.parse(localStorage.getItem("history") || "[]");
    setHistory(data.reverse());
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const getDepartmentBreakdown = (items) => {
    const result = {
      WESTERN: 0,
      THAI: 0,
      BAR: 0,
    };

    items.forEach((i) => {
      if (!result[i.station]) result[i.station] = 0;
      result[i.station] += i.price;
    });

    return result;
  };

  return (
    <div className="p-6 space-y-6">

      <div className="text-2xl">History</div>

      {history.map((order) => {
        const breakdown = getDepartmentBreakdown(order.items);

        return (
          <div key={order.id} className="bg-white/10 p-4 rounded-xl space-y-3">

            <div className="flex justify-between">
              <div>Table: {order.table}</div>
              <div>{order.total} THB</div>
            </div>

            <div className="text-sm opacity-70">
              {new Date(order.closed_at || order.completed_at).toLocaleString()}
            </div>

            {/* ITEMS */}
            <div className="text-sm space-y-1">
              {order.items.map((item) => (
                <div key={item.id}>
                  {item.name} - {item.price}
                </div>
              ))}
            </div>

            {/* BREAKDOWN */}
            <div className="text-sm border-t border-white/10 pt-2 space-y-1">
              <div>WESTERN: {breakdown.WESTERN} THB</div>
              <div>THAI: {breakdown.THAI} THB</div>
              <div>BAR: {breakdown.BAR} THB</div>
            </div>

          </div>
        );
      })}
    </div>
  );
}