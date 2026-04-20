"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";
import { useRouter } from "next/navigation";

export default function TablesPage() {
  const [tables, setTables] = useState([]);
  const router = useRouter();

  const loadTables = () => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    const activeTables = stored.filter((o) => o.status !== "closed");

    setTables(activeTables);
  };

  useEffect(() => {
    loadTables();

    const interval = setInterval(loadTables, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppShell>
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
                onClick={() => router.push(`/tables/${table.id}`)}
                className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 cursor-pointer hover:bg-white/10 transition"
              >
                <div className="flex justify-between items-center">
                  <div className="text-xl">Table {table.table}</div>
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

              </div>
            );
          })}

        </div>

      </div>
    </AppShell>
  );
}