"use client";

import { useEffect, useState } from "react";

export default function History() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    try {
      const localData = JSON.parse(localStorage.getItem("history")) || [];
      setHistory(localData);
    } catch (err) {
      console.error("History load error:", err);
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

        {/* HEADER */}
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            History
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Saved Days
          </h1>
          <p className="text-white/60 mt-2 max-w-xl">
            Local archive of saved business days.
          </p>
        </div>

        {/* CONTENT */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 md:p-8">

          {history.length === 0 ? (
            <div className="text-white/50 text-sm">
              No saved history yet.
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((day, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl bg-black/30 border border-white/10"
                >
                  <p className="text-sm text-white/50">Date</p>
                  <p className="text-lg font-medium">{day.date || "Unknown"}</p>

                  <p className="text-sm text-white/50 mt-2">Revenue</p>
                  <p className="text-lg">THB {day.revenue || 0}</p>
                </div>
              ))}
            </div>
          )}

        </div>

      </div>
    </div>
  );
}