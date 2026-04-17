"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const h = JSON.parse(localStorage.getItem("history")) || [];
    setHistory(h);
  }, []);

  const latest = history[0];
  const last3 = history.slice(0, 3);

  return (
    <AppShell>
      <div className="space-y-12">

        {/* HEADER */}
        <div>
          <h1 className="text-5xl font-semibold text-white">
            Manager System
          </h1>
          <p className="text-white/50 mt-2">
            Real-time performance & control overview
          </p>
        </div>

        {!latest ? (
          <div className="text-white/70">No data</div>
        ) : (
          <>
            {/* 🔥 HERO KPI (DOMINANT) */}
            <div className="relative overflow-hidden rounded-3xl p-10 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
              
              <p className="text-white/50 text-sm mb-3">
                Today’s Revenue
              </p>

              <h2 className="text-6xl font-semibold tracking-tight text-white">
                THB {latest.revenue}
              </h2>

              <div className="absolute inset-0 bg-orange-500/5 pointer-events-none" />
            </div>

            {/* KPI STRIP */}
            <div className="grid grid-cols-3 gap-6">

              <div className="rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-xl">
                <p className="text-white/40 text-xs uppercase tracking-wide">
                  Orders
                </p>
                <p className="text-white text-2xl mt-1">
                  {latest.orders}
                </p>
              </div>

              <div className="rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-xl">
                <p className="text-white/40 text-xs uppercase tracking-wide">
                  Avg Order
                </p>
                <p className="text-white text-2xl mt-1">
                  THB {Math.round(latest.avgOrderValue)}
                </p>
              </div>

              <div className="rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-xl">
                <p className="text-white/40 text-xs uppercase tracking-wide">
                  FOH Score
                </p>
                <p className="text-white text-2xl mt-1">
                  {latest.fohScore}
                </p>
              </div>

            </div>

            {/* TRENDS (LESS IMPORTANT) */}
            <div className="rounded-3xl bg-white/5 border border-white/10 p-6 backdrop-blur-xl">
              <p className="text-white/60 mb-4 text-sm uppercase tracking-wide">
                Last 3 Days
              </p>

              <div className="space-y-2">
                {last3.map((d, i) => (
                  <div
                    key={i}
                    className="flex justify-between text-white/70 text-sm"
                  >
                    <span>Day {i + 1}</span>
                    <span>THB {d.revenue}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI INSIGHT (SUBTLE, NOT LOUD) */}
            <div className="rounded-2xl bg-yellow-500/5 border border-yellow-500/20 p-5 backdrop-blur-xl">
              <p className="text-yellow-400 text-sm">
                ⚠ Avg order value is decreasing — consider upsell focus
              </p>
            </div>

          </>
        )}
      </div>
    </AppShell>
  );
}