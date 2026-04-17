"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [monthlyPayroll, setMonthlyPayroll] = useState(null);
  const [attendanceData, setAttendanceData] = useState([]);
  const [staffActions, setStaffActions] = useState({});

  useEffect(() => {
    const attendance =
      JSON.parse(localStorage.getItem("attendance")) || [];

    const actions =
      JSON.parse(localStorage.getItem("staffActions")) || {};

    setAttendanceData(attendance);

    // ✅ RUN SYSTEM
    runSystem(attendance, actions);

    // ✅ AUTO PAYROLL (THIS WAS MISSING)
    const payroll = generatePayroll();
    setMonthlyPayroll(payroll);
  }, []);

  // =========================
  // AUTO PAYROLL GENERATION
  // =========================
  const generatePayroll = () => {
    const history =
      JSON.parse(localStorage.getItem("history")) || [];

    if (history.length === 0) return null;

    const staffMap = {};

    history.forEach((day) => {
      day.staff?.forEach((s) => {
        if (!staffMap[s.name]) {
          staffMap[s.name] = {
            name: s.name,
            salary: 0,
            bonus: 0,
            total: 0,
            staffConfirmed: false,
            managerApproved: false,
            paymentConfirmed: false,
          };
        }

        // 👉 service charge payout = bonus
        staffMap[s.name].bonus += Number(s.payout || 0);
      });
    });

    const staffArray = Object.values(staffMap).map((s) => ({
      ...s,
      total: s.salary + s.bonus,
    }));

    const result = {
      createdAt: new Date().toISOString(),
      staff: staffArray,
    };

    localStorage.setItem("monthlyPayroll", JSON.stringify(result));

    return result;
  };

  // =========================
  // MAIN SYSTEM ENGINE
  // =========================
  const runSystem = (attendance, actions) => {
    let updated = { ...actions };

    updated = detectAttendanceIssues(attendance, updated);
    updated = detectPerformanceIssues(updated);
    updated = applyRecovery(updated);

    localStorage.setItem("staffActions", JSON.stringify(updated));
    setStaffActions(updated);
  };

  // =========================
  // ATTENDANCE DETECTION
  // =========================
  const detectAttendanceIssues = (attendance, actions) => {
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
  // PERFORMANCE DETECTION
  // =========================
  const detectPerformanceIssues = (actions) => {
    const history =
      JSON.parse(localStorage.getItem("history")) || [];

    if (history.length === 0) return actions;

    const updated = { ...actions };

    const staffPerformance = {};

    history.forEach((day) => {
      day.staff?.forEach((s) => {
        if (!staffPerformance[s.name]) {
          staffPerformance[s.name] = [];
        }
        staffPerformance[s.name].push(s.level);
      });
    });

    Object.entries(staffPerformance).forEach(([name, levels]) => {
      const badCount = levels.filter((l) => l <= 0.4).length;

      if (!updated[name]) {
        if (badCount >= 5) {
          updated[name] = "Final Warning";
        } else if (badCount >= 3) {
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

      if (goodDays === 3) {
        delete updated[name];
      }
    });

    return updated;
  };

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