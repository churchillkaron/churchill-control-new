"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [monthlyPayroll, setMonthlyPayroll] = useState(null);
  const [attendanceData, setAttendanceData] = useState([]);
  const [staffActions, setStaffActions] = useState({});

  useEffect(() => {
    const payroll =
      JSON.parse(localStorage.getItem("monthlyPayroll")) || null;

    const attendance =
      JSON.parse(localStorage.getItem("attendance")) || [];

    const actions =
      JSON.parse(localStorage.getItem("staffActions")) || {};

    setMonthlyPayroll(payroll);
    setAttendanceData(attendance);

    runSystem(attendance, actions);
  }, []);

  // =========================
  // MAIN SYSTEM ENGINE
  // =========================
  const runSystem = (attendance, actions) => {
    let updated = { ...actions };

    updated = autoDetectIssues(attendance, updated);
    updated = applyRecovery(updated);

    localStorage.setItem("staffActions", JSON.stringify(updated));
    setStaffActions(updated);
  };

  // =========================
  // DETECTION (UNCHANGED)
  // =========================
  const autoDetectIssues = (attendance, actions) => {
    const updated = { ...actions };

    const staffMap = {};

    attendance.forEach((entry) => {
      if (!staffMap[entry.name]) {
        staffMap[entry.name] = [];
      }
      staffMap[entry.name].push(entry);
    });

    Object.entries(staffMap).forEach(([name, entries]) => {
      const lateCount = entries.filter(
        (e) => e.late && e.approved !== true
      ).length;

      if (!updated[name]) {
        if (lateCount >= 5) {
          updated[name] = "Final Warning";
        } else if (lateCount >= 3) {
          updated[name] = "Under Review";
        }
      }
    });

    return updated;
  };

  // =========================
  // PER-STAFF RECOVERY
  // =========================
  const applyRecovery = (actions) => {
    const history =
      JSON.parse(localStorage.getItem("history")) || [];

    if (history.length < 3) return actions;

    const last3 = history.slice(0, 3);

    const updated = { ...actions };

    Object.keys(updated).forEach((name) => {
      let goodDays = 0;

      last3.forEach((day) => {
        const staffEntry = day.staff?.find(
          (s) => s.name === name
        );

        if (staffEntry && staffEntry.level >= 0.7) {
          goodDays++;
        }
      });

      // clear only if THIS staff had 3 good days
      if (goodDays === 3) {
        delete updated[name];
      }
    });

    return updated;
  };

  // =========================
  // UI COLOR
  // =========================
  const getActionColor = (action) => {
    if (action === "Final Warning") return "text-red-500";
    if (action === "Under Review") return "text-yellow-400";
    return "text-green-400";
  };

  if (!monthlyPayroll) {
    return <div className="text-white p-10">No payroll yet</div>;
  }

  return (
    <div className="min-h-screen text-white p-10">

      <h1 className="text-3xl mb-6">Manager Dashboard</h1>

      {monthlyPayroll.staff.map((s, i) => {
        const action = staffActions[s.name] || "Normal";

        return (
          <div key={i} className="mb-4 p-4 bg-white/10 rounded-xl">

            <strong>{s.name}</strong>

            <br />

            <span className={getActionColor(action)}>
              Status: {action}
            </span>

            <br />
            Total: THB {Math.round(s.total)}

          </div>
        );
      })}

    </div>
  );
}