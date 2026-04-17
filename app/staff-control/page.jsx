"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function StaffControl() {
  const [staffData, setStaffData] = useState([]);

  useEffect(() => {
    try {
      const history = JSON.parse(localStorage.getItem("history")) || [];
      const attendance = JSON.parse(localStorage.getItem("attendance")) || [];
      const actions = JSON.parse(localStorage.getItem("staffActions")) || {};

      const map = {};

      for (const day of history) {
        const staffList = day.staff || [];

        for (const s of staffList) {
          if (!map[s.name]) {
            map[s.name] = {
              name: s.name,
              levels: [],
              payout: 0,
            };
          }

          map[s.name].levels.push(s.level || 0);
          map[s.name].payout += Number(s.payout || 0);
        }
      }

      const result = [];

      for (const name in map) {
        const s = map[name];

        const performance =
          s.levels.length > 0
            ? s.levels.reduce((a, b) => a + b, 0) / s.levels.length
            : 0;

        const late = attendance.filter(
          (e) => e.name === name && e.late && !e.approved
        ).length;

        const action = actions[name] || "Normal";

        result.push({
          name,
          performance,
          payout: s.payout,
          late,
          action,
        });
      }

      result.sort((a, b) => {
        if (b.performance !== a.performance) return b.performance - a.performance;
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
    <AppShell>
      <div className="space-y-14">

        {/* HEADER */}
        <div className="space-y-2">
          <h1 className="text-3xl font-medium text-white/90">
            Staff Control
          </h1>
          <p className="text-white/50 text-sm">
            Performance ranking, attendance penalties, and payout overview
          </p>
        </div>

        {/* EMPTY STATE */}
        {staffData.length === 0 && (
          <div className="relative">
            <div className="absolute -inset-2 bg-white/5 blur-xl rounded-xl" />
            <div className="relative text-white/40 p-6 rounded-xl border border-white/10 bg-white/[0.04]">
              No staff data available
            </div>
          </div>
        )}

        {/* STAFF LIST */}
        <div className="space-y-6">

          {staffData.map((s, i) => (
            <div key={i} className="relative">

              <div className="absolute -inset-3 bg-white/5 blur-2xl rounded-2xl" />

              <div className="relative bg-white/[0.06] backdrop-blur-xl border border-white/10 p-6 rounded-2xl
                shadow-[0_25px_70px_rgba(0,0,0,0.6)]"
              >

                {/* TOP ROW */}
                <div className="flex justify-between items-center mb-4">
                  <div className="text-lg font-medium">
                    {s.name}
                  </div>

                  <div className="text-[#ff7a00] font-medium">
                    THB {Math.round(s.payout)}
                  </div>
                </div>

                {/* PERFORMANCE */}
                <div className="mb-2 text-sm text-white/60">
                  Performance:{" "}
                  <span className="text-white/90">
                    {(s.performance * 100).toFixed(0)}%
                  </span>
                </div>

                {/* LATE */}
                <div className="mb-2 text-sm text-white/60">
                  Late (unapproved):{" "}
                  <span className="text-yellow-400">
                    {s.late}
                  </span>
                </div>

                {/* STATUS */}
                <div className="text-sm text-white/60">
                  Status:{" "}
                  <span
                    className={
                      s.action === "Critical"
                        ? "text-red-400"
                        : s.action === "Warning"
                        ? "text-yellow-400"
                        : "text-green-400"
                    }
                  >
                    {s.action}
                  </span>
                </div>

              </div>
            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}