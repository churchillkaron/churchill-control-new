"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function StaffControl() {
  const [staffData, setStaffData] = useState([]);
  const [attendance, setAttendance] = useState([]);

  const loadData = () => {
    try {
      const history = JSON.parse(localStorage.getItem("history")) || [];
      const attendanceData = JSON.parse(localStorage.getItem("attendance")) || [];
      const actions = JSON.parse(localStorage.getItem("staffActions")) || {};

      setAttendance(attendanceData);

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

        const lateEntries = attendanceData.filter(
          (e) => e.name === name && e.late && !e.approved
        );

        const late = lateEntries.length;

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
  };

  useEffect(() => {
    loadData();

    const handleStorageChange = () => {
      loadData();
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // 🔥 APPROVE LATE
  const approveLate = (name) => {
    const updated = attendance.map((e) =>
      e.name === name && e.late && !e.approved
        ? { ...e, approved: true }
        : e
    );

    localStorage.setItem("attendance", JSON.stringify(updated));
    loadData();
  };

  // 🔥 REMOVE PENALTY
  const removePenalty = (name) => {
    const payroll =
      JSON.parse(localStorage.getItem("monthlyPayroll")) || null;

    if (!payroll) return;

    const index = payroll.staff.findIndex((s) => s.name === name);

    if (index === -1) return;

    payroll.staff[index].penalty = 0;

    localStorage.setItem("monthlyPayroll", JSON.stringify(payroll));
    loadData();
  };

  // 🔥 SET ACTION STATUS
  const setAction = (name, action) => {
    const actions =
      JSON.parse(localStorage.getItem("staffActions")) || {};

    actions[name] = action;

    localStorage.setItem("staffActions", JSON.stringify(actions));
    loadData();
  };

  return (
    <AppShell>
      <div className="space-y-14">

        {/* HEADER */}
        <div className="space-y-2">
          <h1 className="text-3xl font-medium text-white/90">
            Staff Control
          </h1>
          <p className="text-white/50 text-sm">
            Manager control: performance, attendance, and payroll actions
          </p>
        </div>

        {staffData.length === 0 && (
          <div className="text-white/40">
            No staff data available
          </div>
        )}

        <div className="space-y-6">

          {staffData.map((s, i) => (
            <div key={i} className="bg-white/[0.06] border border-white/10 p-6 rounded-2xl">

              {/* TOP */}
              <div className="flex justify-between items-center mb-4">
                <div className="text-lg">{s.name}</div>
                <div className="text-[#ff7a00]">
                  THB {Math.round(s.payout)}
                </div>
              </div>

              {/* DATA */}
              <div className="text-sm space-y-1 mb-4">
                <div>
                  Performance: {(s.performance * 100).toFixed(0)}%
                </div>
                <div>
                  Late (unapproved):{" "}
                  <span className="text-yellow-400">{s.late}</span>
                </div>
                <div>
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

              {/* 🔥 ACTIONS */}
              <div className="flex flex-wrap gap-3">

                {s.late > 0 && (
                  <button
                    onClick={() => approveLate(s.name)}
                    className="bg-green-500 px-3 py-1 rounded-lg text-sm"
                  >
                    Approve Late
                  </button>
                )}

                <button
                  onClick={() => removePenalty(s.name)}
                  className="bg-blue-500 px-3 py-1 rounded-lg text-sm"
                >
                  Remove Penalty
                </button>

                <button
                  onClick={() => setAction(s.name, "Warning")}
                  className="bg-yellow-500 px-3 py-1 rounded-lg text-sm"
                >
                  Warning
                </button>

                <button
                  onClick={() => setAction(s.name, "Critical")}
                  className="bg-red-500 px-3 py-1 rounded-lg text-sm"
                >
                  Critical
                </button>

                <button
                  onClick={() => setAction(s.name, "Normal")}
                  className="bg-gray-500 px-3 py-1 rounded-lg text-sm"
                >
                  Reset
                </button>

              </div>

            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}