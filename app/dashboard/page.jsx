"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [history, setHistory] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [staffActions, setStaffActions] = useState({});
  const [payroll, setPayroll] = useState(null);

  useEffect(() => {
    const h = JSON.parse(localStorage.getItem("history")) || [];
    const a = JSON.parse(localStorage.getItem("attendance")) || [];
    const actions = JSON.parse(localStorage.getItem("staffActions")) || {};

    setHistory(h);
    setAttendance(a);

    runSystem(a, actions);
    const p = generatePayroll(h);
    setPayroll(p);
  }, []);

  // =========================
  // PAYROLL
  // =========================
  const generatePayroll = (history) => {
    if (history.length === 0) return null;

    const staffMap = {};

    history.forEach((day) => {
      day.staff?.forEach((s) => {
        if (!staffMap[s.name]) {
          staffMap[s.name] = {
            name: s.name,
            total: 0,
            bonus: 0,
          };
        }

        staffMap[s.name].bonus += Number(s.payout || 0);
      });
    });

    const staffArray = Object.values(staffMap).map((s) => ({
      ...s,
      total: s.bonus,
    }));

    return { staff: staffArray };
  };

  // =========================
  // SYSTEM ENGINE
  // =========================
  const runSystem = (attendance, actions) => {
    let updated = { ...actions };

    updated = detectAttendanceIssues(attendance, updated);
    updated = detectPerformanceIssues(updated);

    localStorage.setItem("staffActions", JSON.stringify(updated));
    setStaffActions(updated);
  };

  const detectAttendanceIssues = (attendance, actions) => {
    const updated = { ...actions };

    const map = {};

    attendance.forEach((e) => {
      if (!map[e.name]) map[e.name] = [];
      map[e.name].push(e);
    });

    Object.entries(map).forEach(([name, entries]) => {
      const lateCount = entries.filter(
        (e) => e.late && e.approved !== true
      ).length;

      if (!updated[name]) {
        if (lateCount >= 5) updated[name] = "Final Warning";
        else if (lateCount >= 3) updated[name] = "Under Review";
      }
    });

    return updated;
  };

  const detectPerformanceIssues = (actions) => {
    const updated = { ...actions };

    const performance = {};

    history.forEach((day) => {
      day.staff?.forEach((s) => {
        if (!performance[s.name]) performance[s.name] = [];
        performance[s.name].push(s.level);
      });
    });

    Object.entries(performance).forEach(([name, levels]) => {
      const bad = levels.filter((l) => l <= 0.4).length;

      if (!updated[name]) {
        if (bad >= 5) updated[name] = "Final Warning";
        else if (bad >= 3) updated[name] = "Under Review";
      }
    });

    return updated;
  };

  // =========================
  // HELPERS
  // =========================
  const getLatestDay = () => history[0] || {};

  const getStaffPerformance = (name) => {
    let scores = [];

    history.forEach((day) => {
      const s = day.staff?.find((x) => x.name === name);
      if (s) scores.push(s.level);
    });

    if (scores.length === 0) return 0;

    return (
      scores.reduce((a, b) => a + b, 0) / scores.length
    );
  };

  const getLateCount = (name) => {
    return attendance.filter(
      (e) => e.name === name && e.late && !e.approved
    ).length;
  };

  const getColor = (value) => {
    if (value >= 0.9) return "text-green-400";
    if (value >= 0.7) return "text-yellow-400";
    if (value >= 0.4) return "text-orange-400";
    return "text-red-500";
  };

  if (!payroll) {
    return <div className="text-white p-10">No data</div>;
  }

  const latest = getLatestDay();

  // =========================
  // RANKING
  // =========================
  const ranked = [...payroll.staff].sort(
    (a, b) => b.total - a.total
  );

  const top = ranked.slice(0, 3);
  const worst = ranked.slice(-3);

  return (
    <div className="min-h-screen text-white p-10 space-y-8">

      <h1 className="text-3xl">Control Dashboard</h1>

      {/* TOP */}
      <div className="bg-white/10 p-6 rounded-xl">
        <div>Revenue: THB {latest.revenue || 0}</div>
        <div>Orders: {latest.totalOrders || 0}</div>
        <div>Avg: THB {Math.round(latest.avgOrderValue || 0)}</div>
        <div>FOH Score: {latest.scores?.foh || 0}</div>
        <div>Service Charge: THB {latest.serviceCharge || 0}</div>
      </div>

      {/* ALERTS */}
      <div className="bg-white/10 p-6 rounded-xl">
        <h2 className="mb-2">Alerts</h2>

        {Object.entries(staffActions).map(([name, status]) => (
          <div key={name}>
            {name} → {status}
          </div>
        ))}
      </div>

      {/* STAFF */}
      <div className="space-y-4">
        {payroll.staff.map((s, i) => {
          const perf = getStaffPerformance(s.name);
          const late = getLateCount(s.name);
          const status = staffActions[s.name] || "Normal";

          return (
            <div key={i} className="bg-white/10 p-4 rounded-xl">

              <div className="flex justify-between">
                <strong>{s.name}</strong>
                <div>THB {Math.round(s.total)}</div>
              </div>

              <div className={getColor(perf)}>
                Performance: {(perf * 100).toFixed(0)}%
              </div>

              <div>Late: {late}</div>
              <div>Status: {status}</div>

            </div>
          );
        })}
      </div>

      {/* RANKING */}
      <div className="bg-white/10 p-6 rounded-xl">
        <h2>Top Performers</h2>
        {top.map((s) => (
          <div key={s.name}>{s.name} - THB {Math.round(s.total)}</div>
        ))}

        <h2 className="mt-4">Worst Performers</h2>
        {worst.map((s) => (
          <div key={s.name}>{s.name} - THB {Math.round(s.total)}</div>
        ))}
      </div>

    </div>
  );
}