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

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 space-y-8">

        {/* HEADER */}
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            History
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Saved Days
          </h1>
        </div>

        {/* EMPTY */}
        {history.length === 0 && (
          <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
            No saved history yet
          </div>
        )}

        {/* DATA */}
        <div className="space-y-6">
          {history.map((day, i) => (
            <div
              key={i}
              className="p-6 rounded-2xl bg-black/30 border border-white/10 space-y-4"
            >

              {/* DATE */}
              <div className="flex justify-between items-center">
                <div className="text-lg">{day.date}</div>
                <div className="text-[#ffb36b]">
                  THB {day.revenue.toLocaleString()}
                </div>
              </div>

              {/* SERVICE CHARGE */}
              <div className="text-sm text-white/60">
                Service Charge: THB {day.serviceCharge?.toLocaleString() || 0}
              </div>

              {/* PAYOUT BREAKDOWN */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                  <p className="text-xs text-white/50">FOH</p>
                  <p className="text-[#ffb36b]">
                    THB {day.payouts?.foh?.toLocaleString() || 0}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                  <p className="text-xs text-white/50">BAR</p>
                  <p className="text-[#ffb36b]">
                    THB {day.payouts?.bar?.toLocaleString() || 0}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                  <p className="text-xs text-white/50">KITCHEN</p>
                  <p className="text-[#ffb36b]">
                    THB {day.payouts?.kitchen?.toLocaleString() || 0}
                  </p>
                </div>

              </div>

            </div>
          ))}
        </div>

      </div>
    </div>
  );
}