"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

import { supabase } from "../../lib/supabase";

export default function Tables() {
  const [orders, setOrders] = useState([]);

  const tables = Array.from({ length: 12 }, (_, i) => `T${i + 1}`);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .neq("status", "Paid");

    setOrders(data || []);
  };

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("tables-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        () => fetchOrders()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // 🔥 GET TABLE DATA
  const getTableData = (table) => {
    const tableOrders = orders.filter(
      (o) => o.table_name === table
    );

    if (tableOrders.length === 0) {
      return { status: "free", revenue: 0 };
    }

    const revenue = tableOrders.reduce(
      (sum, o) => sum + o.total,
      0
    );

    const hasServed = tableOrders.some(
      (o) => o.status === "Served"
    );

    const status = hasServed ? "served" : "active";

    return { status, revenue };
  };

  return (
    <AppShell>
      <div className="space-y-10">

        <h1 className="text-3xl font-semibold">
          Table Dashboard
        </h1>

        <div className="grid grid-cols-3 md:grid-cols-4 gap-6">

          {tables.map((t) => {
            const data = getTableData(t);

            const color =
              data.status === "free"
                ? "bg-green-500/20"
                : data.status === "active"
                ? "bg-orange-500/20"
                : "bg-blue-500/20";

            return (
              <div
                key={t}
                className={`p-6 rounded-2xl border border-white/10 ${color}`}
              >

                <div className="text-lg font-medium mb-2">
                  {t}
                </div>

                <div className="text-sm text-white/60">
                  Status: {data.status}
                </div>

                <div className="mt-2 text-[#ff7a00]">
                  THB {data.revenue.toLocaleString()}
                </div>

              </div>
            );
          })}

        </div>

      </div>
    </AppShell>
  );
}