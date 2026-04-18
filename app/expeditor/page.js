"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ExpeditorPage() {
  const [tables, setTables] = useState([]);

  const loadOrders = () => {
    const data = JSON.parse(localStorage.getItem("orders") || "[]");

    const active = data.filter((o) => o.status !== "SERVED");

    // 🔥 GROUP BY TABLE
    const grouped = {};

    active.forEach((order) => {
      if (!grouped[order.table]) {
        grouped[order.table] = [];
      }
      grouped[order.table].push(order);
    });

    const tableView = Object.keys(grouped).map((table) => {
      const orders = grouped[table];

      const allDone = orders.every((o) => o.status === "SERVED");
      const anyPreparing = orders.some((o) => o.status === "PREPARING");

      return {
        table,
        orders,
        status: allDone
          ? "READY"
          : anyPreparing
          ? "IN PROGRESS"
          : "WAITING",
      };
    });

    setTables(tableView);
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 1000);
    return () => clearInterval(interval);
  }, []);

  const markServed = (table) => {
    const all = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = all.map((order) => {
      if (order.table === table) {
        return { ...order, status: "SERVED" };
      }
      return order;
    });

    localStorage.setItem("orders", JSON.stringify(updated));
    loadOrders();
  };

  const getColor = (status) => {
    if (status === "READY") return "bg-green-500/30";
    if (status === "IN PROGRESS") return "bg-orange-500/30";
    return "bg-white/5";
  };

  return (
    <AppShell>
      <div className="space-y-6">

        <h1 className="text-4xl font-semibold">
          Expeditor Screen
        </h1>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">

          {tables.map((table) => (
            <div
              key={table.table}
              className={`${getColor(table.status)} border border-white/10 rounded-2xl p-5 space-y-4`}
            >

              {/* HEADER */}
              <div>
                <div className="text-xl font-semibold">
                  Table {table.table}
                </div>

                <div className="text-sm text-white/60">
                  {table.status}
                </div>
              </div>

              {/* STATIONS */}
              <div className="space-y-2 text-sm">

                {table.orders.map((order) => (
                  <div key={order.id} className="flex justify-between">

                    <span>{order.station}</span>
                    <span>{order.status}</span>

                  </div>
                ))}

              </div>

              {/* ACTION */}
              {table.status === "READY" && (
                <button
                  onClick={() => markServed(table.table)}
                  className="w-full bg-[#ff7a00] py-3 rounded-xl text-black font-semibold"
                >
                  Serve Table
                </button>
              )}

            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}