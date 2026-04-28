"use client";

import { useEffect, useState } from "react";


export default function RevenuePage() {
  const [history, setHistory] = useState([]);
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const savedHistory = JSON.parse(localStorage.getItem("history") || "[]");
    const posOrders = JSON.parse(localStorage.getItem("orders") || "[]");

    setHistory(savedHistory);
    setOrders(posOrders);
  }, []);

  // latest closed day
  const latestDay = history[history.length - 1] || {};

  const totalRevenue = latestDay?.revenue || 0;
  const totalOrders = latestDay?.totalOrders || orders.length || 0;
  const avgOrder =
    totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // today live revenue (from POS if open)
  const liveRevenue = orders.reduce(
    (sum, o) => sum + Number(o.total || 0),
    0
  );

  return (
  
      <div className="min-h-screen text-white p-6 max-w-5xl mx-auto space-y-10">

        {/* HEADER */}
        <div>
          <h1 className="text-3xl font-semibold">Revenue</h1>
          <p className="text-white/40 text-sm">
            Sales performance + control
          </p>
        </div>

        {/* CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <div className="bg-white/5 p-6 rounded-2xl">
            <p className="text-white/40 text-sm">Latest Closed Day</p>
            <h2 className="text-2xl mt-2 text-green-400">
              {totalRevenue.toLocaleString()} THB
            </h2>
          </div>

          <div className="bg-white/5 p-6 rounded-2xl">
            <p className="text-white/40 text-sm">Orders</p>
            <h2 className="text-2xl mt-2">
              {totalOrders.toLocaleString()}
            </h2>
          </div>

          <div className="bg-white/5 p-6 rounded-2xl">
            <p className="text-white/40 text-sm">Avg Order</p>
            <h2 className="text-2xl mt-2">
              {avgOrder.toLocaleString()} THB
            </h2>
          </div>

        </div>

        {/* LIVE */}
        <div className="bg-white/5 p-6 rounded-2xl">

          <p className="text-white/40 text-sm">Live (POS)</p>

          <h2 className="text-2xl mt-2 text-orange-400">
            {liveRevenue.toLocaleString()} THB
          </h2>

        </div>

        {/* HISTORY LIST */}
        <div className="space-y-3">

          <h2 className="text-xl">History</h2>

          {history
            .slice()
            .reverse()
            .map((day, i) => (
              <div
                key={i}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between"
              >
                <div>
                  <div>{day.date || "No date"}</div>
                  <div className="text-xs text-white/40">
                    Orders: {day.totalOrders || 0}
                  </div>
                </div>

                <div className="text-green-400">
                  {Number(day.revenue || 0).toLocaleString()} THB
                </div>
              </div>
            ))}

          {history.length === 0 && (
            <div className="text-white/40">No revenue data</div>
          )}

        </div>

      </div>

  );
}