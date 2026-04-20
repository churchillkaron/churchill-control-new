"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AppShell from "../../AppShell";

export default function TableDetailPage() {
  const { id } = useParams();
  const [table, setTable] = useState(null);

  const loadTable = () => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");
    const found = stored.find((o) => String(o.id) === id);
    setTable(found || null);
  };

  useEffect(() => {
    loadTable();
    const interval = setInterval(loadTable, 1000);
    return () => clearInterval(interval);
  }, [id]);

  const closeTable = () => {
    const stored = JSON.parse(localStorage.getItem("orders") || "[]");

    const updated = stored.map((o) => {
      if (String(o.id) !== id) return o;
      return {
        ...o,
        status: "closed",
        closed_at: new Date().toISOString(),
      };
    });

    localStorage.setItem("orders", JSON.stringify(updated));

    alert("Table closed ✅");
    loadTable();
  };

  if (!table) {
    return (
      <AppShell>
        <div className="text-white">Table not found</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Table {table.table}</h1>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg">Items</h2>

          {table.items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between border-b border-white/10 pb-2 text-sm"
            >
              <div>
                {item.name}
                <div className="text-xs text-white/50">
                  {item.status}
                </div>
              </div>

              <div>{item.price} THB</div>
            </div>
          ))}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex justify-between">
          <span>Total</span>
          <span>{table.total} THB</span>
        </div>

        <button
          onClick={closeTable}
          className="bg-red-500 px-6 py-3 rounded-xl"
        >
          Close Table
        </button>

      </div>
    </AppShell>
  );
}