"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

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
    <AppShell>
      <div className="space-y-14">

        {/* HEADER */}
        <div className="space-y-2">
          <h1 className="text-3xl font-medium text-white/90">
            History
          </h1>
          <p className="text-white/50 text-sm">
            Saved operating days, performance, and payout history
          </p>
        </div>

        {/* EMPTY STATE */}
        {history.length === 0 && (
          <div className="relative">
            <div className="absolute -inset-2 bg-white/5 blur-xl rounded-xl" />
            <div className="relative text-red-400 p-6 rounded-xl border border-white/10 bg-white/[0.04]">
              No saved history
            </div>
          </div>
        )}

        {/* HISTORY LIST */}
        <div className="space-y-8">

          {history.map((day, i) => (
            <div key={i} className="relative">

              <div className="absolute -inset-4 bg-white/5 blur-2xl rounded-3xl" />

              <div className="relative p-6 md:p-8 rounded-3xl bg-white/[0.06] border border-white/10 backdrop-blur-xl
                shadow-[0_30px_90px_rgba(0,0,0,0.7)]"
              >

                {/* HEADER */}
                <div className="flex justify-between items-center mb-4">
                  <div className="text-lg font-medium">
                    {day.date}
                  </div>

                  <div className="text-[#ff7a00] font-semibold text-lg">
                    THB {Number(day.revenue || 0).toLocaleString()}
                  </div>
                </div>

                <div className="text-sm text-white/50 mb-6">
                  Service Charge: THB {Number(day.serviceCharge || 0).toLocaleString()}
                </div>

                {/* FOH PERFORMANCE */}
                {day.levels && (
                  <div className="mb-6">

                    <div className={`text-lg font-medium ${getColor(day.levels.foh)}`}>
                      FOH → {day.levels.foh}

                      {day.scores?.foh && (
                        <span className="ml-3 text-white/60 text-sm">
                          (Score: {day.scores.foh})
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-white/50 mt-1">
                      Orders: {day.totalOrders || 0} | Avg: THB {Math.round(day.avgOrderValue || 0)}
                    </div>

                  </div>
                )}

                {/* OTHER DEPARTMENTS */}
                {day.levels && (
                  <div className="flex gap-6 mb-6 text-sm">
                    <div className={getColor(day.levels.bar)}>
                      BAR → {day.levels.bar}
                    </div>
                    <div className={getColor(day.levels.kitchen)}>
                      KITCHEN → {day.levels.kitchen}
                    </div>
                  </div>
                )}

                {/* POOLS */}
                {day.payouts && (
                  <div className="grid grid-cols-3 gap-4 mb-6 text-sm">

                    <div className="bg-black/30 p-3 rounded-xl border border-white/10">
                      FOH<br />
                      THB {Number(day.payouts.foh || 0).toFixed(2)}
                    </div>

                    <div className="bg-black/30 p-3 rounded-xl border border-white/10">
                      BAR<br />
                      THB {Number(day.payouts.bar || 0).toFixed(2)}
                    </div>

                    <div className="bg-black/30 p-3 rounded-xl border border-white/10">
                      KITCHEN<br />
                      THB {Number(day.payouts.kitchen || 0).toFixed(2)}
                    </div>

                  </div>
                )}

                {/* STAFF BREAKDOWN */}
                {day.staff && day.staff.length > 0 && (
                  <div>

                    <p className="text-sm text-white/50 mb-3">
                      FOH Staff Breakdown
                    </p>

                    <div className="space-y-2">
                      {day.staff.map((s, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between px-2 py-1 border-b border-white/10"
                        >
                          <div>{s.name}</div>
                          <div>THB {Number(s.payout || 0).toFixed(2)}</div>
                        </div>
                      ))}
                    </div>

                  </div>
                )}

              </div>
            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}