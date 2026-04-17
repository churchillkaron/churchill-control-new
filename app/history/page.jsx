"use client";

import { useEffect, useState } from "react";

export default function History() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("history")) || [];
      setHistory(stored);
    } catch {
      setHistory([]);
    }
  }, []);

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          alt="History background"
          className="w-full h-full object-cover"
        />
      </div>

      {/* OVERLAY */}
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.75),rgba(18,12,8,0.85))]" />

      {/* GLOW */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(255,140,0,0.15),transparent_40%)]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 pt-28 pb-14 space-y-8">

        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            History
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Saved Days
          </h1>
        </div>

        {/* EMPTY STATE */}
        {history.length === 0 && (
          <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
            No saved history yet
          </div>
        )}

        {/* DATA */}
        <div className="space-y-4">
          {history.map((day, i) => (
            <div
              key={i}
              className="p-4 rounded-xl bg-black/30 border border-white/10 flex justify-between"
            >
              <div>{day.date}</div>
              <div className="text-[#ffb36b]">
                THB {day.revenue.toLocaleString()}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}