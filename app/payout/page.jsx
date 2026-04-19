"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function PayoutPage() {
  const [staff, setStaff] = useState([]);
  const [pool, setPool] = useState(0);

  useEffect(() => {
    // 🔹 Get history
    const history = JSON.parse(localStorage.getItem("historyDays")) || [];
    if (history.length === 0) return;

    const lastDay = history[history.length - 1];
    const revenue = lastDay.revenue || 0;
    const serviceCharge = revenue * 0.05;
    setPool(serviceCharge);

    // 🔹 Get performance + attendance
    const performance =
      JSON.parse(localStorage.getItem("staffPerformance")) || [];

    const attendance =
      JSON.parse(localStorage.getItem("staffAttendance")) || [];

    // 🔹 Merge staff data
    const combined = performance.map((p) => {
      const att = attendance.find((a) => a.name === p.name) || {
        late: 0,
        shifts: 1,
      };

      // Attendance score
      const attendanceScore =
        att.shifts > 0
          ? Math.max(40, 100 - (att.late / att.shifts) * 100)
          : 40;

      // Performance score (already calculated in your system)
      const performanceScore = p.score || 50;

      // Final score
      const finalScore = Math.round(
        performanceScore * 0.7 + attendanceScore * 0.3
      );

      return {
        name: p.name,
        role: p.role,
        score: finalScore,
      };
    });

    // 🔹 Total score
    const totalScore = combined.reduce((sum, s) => sum + s.score, 0);

    // 🔹 Final payout
    const result = combined.map((s) => {
      const payout =
        totalScore > 0 ? (s.score / totalScore) * serviceCharge : 0;

      return {
        ...s,
        payout,
      };
    });

    setStaff(result);
  }, []);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Payout</h1>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <div className="text-lg">
            Service Charge Pool: ฿ {pool.toFixed(0)}
          </div>

          <div className="space-y-3">
            {staff.map((s, i) => (
              <div
                key={i}
                className="bg-white/5 border border-white/10 rounded-xl p-4 flex justify-between"
              >
                <div>
                  <div>{s.name}</div>
                  <div className="text-white/50 text-sm">{s.role}</div>
                </div>

                <div className="text-right">
                  <div className="text-orange-400 font-semibold">
                    ฿ {s.payout.toFixed(0)}
                  </div>
                  <div className="text-xs text-white/50">
                    Score: {s.score}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>
    </AppShell>
  );
}