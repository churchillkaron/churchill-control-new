"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import AppShell from "@AppShell.js";


export default function PerformancePage() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const data = getHistoryDays() || [];
    setHistory(data);
  }, []);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Performance</h1>

        <div className="space-y-4">

          {history.map((day) => (
            <DayPerformance key={day.id} day={day} />
          ))}

          {history.length === 0 && (
            <div className="text-white/40">No performance data</div>
          )}

        </div>

      </div>
    </AppShell>
  );
}

function DayPerformance({ day }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">

      <div className="flex justify-between mb-4">
        <span>{day.date}</span>
        <span className="text-white/60">Score</span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">

        <Metric label="FOH" value={day.departmentLevels?.FOH} />
        <Metric label="BAR" value={day.departmentLevels?.BAR} />
        <Metric label="KITCHEN" value={day.departmentLevels?.KITCHEN} />

      </div>

    </div>
  );
}

function Metric({ label, value }) {
  const color =
    value === "GOOD"
      ? "text-green-400"
      : value === "WARNING"
      ? "text-yellow-400"
      : value === "BAD"
      ? "text-red-400"
      : "text-white/40";

  return (
    <div>
      <p className="text-xs text-white/40">{label}</p>
      <p className={color}>{value || "N/A"}</p>
    </div>
  );
}
