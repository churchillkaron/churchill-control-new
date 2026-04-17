"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function StaffControl() {
  const [staffData, setStaffData] = useState([]);

  useEffect(() => {
    try {
      const history =
        JSON.parse(localStorage.getItem("history")) || [];

      const attendance =
        JSON.parse(localStorage.getItem("attendance")) || [];

      const actions =
        JSON.parse(localStorage.getItem("staffActions")) || {};

      const map = {};

      history.forEach((day) => {
        (day.staff || []).forEach((s) => {
          if (!map[s.name]) {
            map[s.name] = {
              name: s.name,
              levels: [],
              payout: 0,
            };
          }

          map[s.name].levels.push(s.level || 0);
          map[s.name].payout += Number(s.payout || 0);
        });
      });

      const result = Object.values(map).map((s) => {
        const perf =
          s.levels.length > 0
            ? s.levels.reduce((a, b) => a + b, 0) / s.levels.length
            : 0;

        const late = attendance.filter(
          (e) => e.name === s.name && e.late && !e.approved
        ).length;

        const action = actions[s.name] || "Normal";

        return {
          name: s.name,
          performance: perf,
          payout: s.payout,
          late,
          action,
        };
      });

      // SORT AFTER BUILD (safe)
      result.sort((a, b) => {
        if (b.performance !== a.performance)
          return b.performance - a.performance;
        if (a.late !== b.late) return a.late - b.late;
        return b.payout - a.payout;
      });

      setStaffData(result);
    } catch (err) {
      console.error("Staff control error:", err);
      setStaffData([]);
    }
  }, []);

  return (
    <div className="min-h-screen text-white p-10 space-y-6">
      <h1 className="text-3xl">Staff Control</h1>

      {staffData.length === 0 && (
        <div>No staff data available</div>
      )}

      {staffData.map((s, i) => (
        <div key={i} className="bg-white/10 p-4 rounded-xl">

          <div className="flex justify-between">
            <strong>{s.name}</strong>
            <div>THB {Math.round(s.payout)}</div>
          </div>

          <div>
            Performance: {(s.performance * 100).toFixed(0)}%
          </div>

          <div>Late: {s.late}</div>
          <div>Status: {s.action}</div>

        </div>
      ))}
    </div>
  );
}