"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function HistoryPage() {
  const [history, setHistory] = useState([]);

  const loadHistory = () => {
    try {
      const data = JSON.parse(localStorage.getItem("history") || "[]");
      setHistory(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <AppShell>
      <div className="space-y-10">

        {/* HEADER */}
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            History
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Saved Orders
          </h1>
        </div>

        {/* EMPTY */}
        {history.length === 0 && (
          <div className="text-white/40">
            No history yet
          </div>
        )}

        {/* LIST */}
        <div className="space-y-4">
          {history
            .slice()
            .reverse()
            .map((item, i) => (
              <div
                key={i}
                className="bg-white/5 border border-white/10 rounded-2xl p-5"
              >
                <div className="flex justify-between">
                  <div>Table {item.table}</div>
                  <div>THB {item.revenue}</div>
                </div>

                <div className="text-sm text-white/50 mt-2">
                  {new Date(item.completed_at).toLocaleString()}
                </div>

                <div className="mt-3 space-y-1 text-sm">
                  {item.items?.map((it, idx) => (
                    <div key={idx}>
                      {it.name}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>

      </div>
    </AppShell>
  );
}