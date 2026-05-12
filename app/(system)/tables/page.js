"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function TablesPage() {
  const [tables, setTables] = useState([]);

  const loadTables = async () => {
    // 🔥 LOAD ORDERS
    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .neq("status", "closed")
      .order("created_at", { ascending: false });

    // 🔥 LOAD ITEMS
    const { data: items } = await supabase
      .from("order_items")
      .select("*");

    // 🔥 MERGE
    const merged = (orders || []).map((order) => ({
      ...order,
      items: (items || []).filter((i) => i.order_id === order.id),
    }));

    setTables(merged);
  };

  useEffect(() => {
    loadTables();
    const interval = setInterval(loadTables, 2000);
    return () => clearInterval(interval);
  }, []);

  // 🔥 CLOSE TABLE (PAY BILL)
  const closeTable = async (orderId) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "closed" })
      .eq("id", orderId);

    if (error) console.error("CLOSE ERROR:", error);

    loadTables();
  };

  return (
  
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Tables</h1>

        <div className="grid md:grid-cols-3 gap-6">

          {tables.length === 0 && (
            <div className="text-white/40 text-sm">
              No active tables
            </div>
          )}

          {tables.map((table) => {
            const totalItems = table.items.length;

            const servedItems = table.items.filter(
              (i) => i.status === "DONE"
            ).length;

            const allServed =
              totalItems > 0 && servedItems === totalItems;

            return (
              <div
                key={table.id}
                className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4"
              >
                <div className="flex justify-between items-center">
                  <div className="text-xl">
                    Table {table.table_number}
                  </div>
                  <div className="text-xs text-white/50">
                    {new Date(table.created_at).toLocaleTimeString()}
                  </div>
                </div>

                <div className="text-sm text-white/50">
                  Items: {totalItems}
                </div>

                <div className="text-lg">
                  {table.total} THB
                </div>

                <div className="text-xs">
                  Status:{" "}
                  {allServed ? (
                    <span className="text-green-400">Ready</span>
                  ) : (
                    <span className="text-yellow-400">In Progress</span>
                  )}
                </div>

                {/* 🔥 ITEM LIST */}
                <div className="text-sm space-y-1">
                  {table.items.map((item) => (
                    <div key={item.id}>
                      {item.item_name} ({item.status})
                    </div>
                  ))}
                </div>

                {/* 🔥 CLOSE BUTTON */}
                {allServed && (
                  <button
                    onClick={() => closeTable(table.id)}
                    className="w-full bg-[#ff7a00] text-black py-2 rounded"
                  >
                    Close Table
                  </button>
                )}
              </div>
            );
          })}

        </div>
      </div>
  
  );
}

