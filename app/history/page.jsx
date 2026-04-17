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

  const getColor = (level) => {
    if (level === "GOOD") return "text-green-400";
    if (level === "WARNING") return "text-yellow-400";
    if (level === "BAD") return "text-orange-400";
    return "text-red-500";
  };

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

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-14 space-y-8">

        <h1 className="text-4xl font-semibold">Saved Days</h1>

        {history.length === 0 && (
          <div className="text-red-400">No saved history</div>
        )}

        <div className="space-y-6">
          {history.map((day, i) => (
            <div
              key={i}
              className="p-6 rounded-2xl bg-black/30 border border-white/10"
            >

              {/* HEADER */}
              <div className="flex justify-between mb-2">
                <div>{day.date}</div>
                <div className="text-[#ffb36b]">
                  THB {day.revenue?.toLocaleString() || 0}
                </div>
              </div>

              <div className="text-sm text-white/50 mb-4">
                Service Charge: THB {day.serviceCharge?.toLocaleString() || 0}
              </div>

              {/* 🔥 FOH PERFORMANCE BLOCK */}
              {day.levels && (
                <div className="mb-4">

                  <div className={`font-semibold ${getColor(day.levels.foh)}`}>
                    FOH → {day.levels.foh}
                    {day.scores?.foh && (
                      <span className="ml-2 text-white/60 text-sm">
                        (Score: {day.scores.foh})
                      </span>
                    )}
                  </div>

                  {/* EXTRA DATA */}
                  {day.totalOrders && (
                    <div className="text-sm text-white/50 mt-1">
                      Orders: {day.totalOrders} | Avg: THB {Math.round(day.avgOrderValue || 0)}
                    </div>
                  )}

                </div>
              )}

              {/* OTHER DEPARTMENTS */}
              {day.levels && (
                <div className="flex gap-6 mb-4 text-sm">
                  <div className={getColor(day.levels.bar)}>
                    BAR → {day.levels.bar}
                  </div>
                  <div className={getColor(day.levels.kitchen)}>
                    KITCHEN → {day.levels.kitchen}
                  </div>
                </div>
              )}

              {/* PAYOUTS */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>FOH<br />THB {day.payouts?.foh?.toFixed(2) || 0}</div>
                <div>BAR<br />THB {day.payouts?.bar?.toFixed(2) || 0}</div>
                <div>KITCHEN<br />THB {day.payouts?.kitchen?.toFixed(2) || 0}</div>
              </div>

              {/* STAFF */}
              {day.staff && day.staff.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-white/50 mb-2">
                    FOH Staff Breakdown
                  </p>

                  {day.staff.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between border-b border-white/10 py-1"
                    >
                      <div>{s.name}</div>
                      <div>THB {s.payout?.toFixed(2) || 0}</div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          ))}
        </div>

      </div>
    </div>
  );
}