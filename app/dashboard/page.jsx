"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [history, setHistory] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [staffActions, setStaffActions] = useState({});
  const [staffData, setStaffData] = useState([]);

  useEffect(() => {
    const h = JSON.parse(localStorage.getItem("history")) || [];
    const a = JSON.parse(localStorage.getItem("attendance")) || [];
    const actions = JSON.parse(localStorage.getItem("staffActions")) || {};

    setHistory(h);
    setAttendance(a);

    const updatedActions = runSystem(a, actions);
    const staff = buildStaffData(h, a, updatedActions);

    setStaffActions(updatedActions);
    setStaffData(staff);
  }, []);

  // =========================
  // SYSTEM ENGINE (UNCHANGED CORE)
  // =========================
  const runSystem = (attendance, actions) => {
    let updated = { ...actions };

    const map = {};
    attendance.forEach((e) => {
      if (!map[e.name]) map[e.name] = [];
      map[e.name].push(e);
    });

    Object.entries(map).forEach(([name, entries]) => {
      const late = entries.filter(
        (e) => e.late && e.approved !== true
      ).length;

      if (!updated[name]) {
        if (late >= 5) updated[name] = "Final Warning";
        else if (late >= 3) updated[name] = "Under Review";
      }
    });

    localStorage.setItem("staffActions", JSON.stringify(updated));
    return updated;
  };

  // =========================
  // BUILD REAL STAFF DATA
  // =========================
  const buildStaffData = (history, attendance, actions) => {
    const map = {};

    history.forEach((day) => {
      day.staff?.forEach((s) => {
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

    return Object.values(map).map((s) => {
      const perf =
        s.levels.length > 0
          ? s.levels.reduce((a, b) => a + b, 0) / s.levels.length
          : 0;

      const late = attendance.filter(
        (e) => e.name === s.name && e.late && !e.approved
      ).length;

      const action = actions[s.name] || "Normal";

      // =========================
      // REAL SCORE (YOUR SYSTEM)
      // =========================
      const score =
        perf * 100 - late * 5 - (action !== "Normal" ? 20 : 0);

      return {
        name: s.name,
        performance: perf,
        payout: s.payout,
        late,
        action,
        score,
      };
    });
  };

  // =========================
  // HELPERS
  // =========================
  const getColor = (value) => {
    if (value >= 0.9) return "text-green-400";
    if (value >= 0.7) return "text-yellow-400";
    if (value >= 0.4) return "text-orange-400";
    return "text-red-500";
  };

  // =========================
  // SORT (CORE LOGIC)
  // =========================
  const ranked = [...staffData].sort((a, b) => {
    // 1. PERFORMANCE
    if (b.performance !== a.performance) {
      return b.performance - a.performance;
    }

    // 2. BEHAVIOR (less late wins)
    if (a.late !== b.late) {
      return a.late - b.late;
    }

    // 3. MONEY (tie breaker)
    return b.payout - a.payout;
  });

  const top = ranked.slice(0, 3);
  const worst = ranked.slice(-3).reverse();

  return (
    <div className="min-h-screen text-white p-10 space-y-8">

      <h1 className="text-3xl">Control Dashboard</h1>

      {/* STAFF LIST */}
      <div className="space-y-4">
        {ranked.map((s, i) => (
          <div key={i} className="bg-white/10 p-4 rounded-xl">

            <div className="flex justify-between">
              <strong>{s.name}</strong>
              <div>THB {Math.round(s.payout)}</div>
            </div>

            <div className={getColor(s.performance)}>
              Performance: {(s.performance * 100).toFixed(0)}%
            </div>

            <div>Late: {s.late}</div>
            <div>Status: {s.action}</div>

          </div>
        ))}
      </div>

      {/* TOP */}
      <div className="bg-white/10 p-6 rounded-xl">
        <h2 className="mb-2">Top Performers</h2>
        {top.map((s) => (
          <div key={s.name}>
            {s.name} → {(s.performance * 100).toFixed(0)}% | THB {Math.round(s.payout)}
          </div>
        ))}
      </div>

      {/* WORST */}
      <div className="bg-white/10 p-6 rounded-xl">
        <h2 className="mb-2">Needs Attention</h2>
        {worst.map((s) => (
          <div key={s.name}>
            {s.name} → {(s.performance * 100).toFixed(0)}% | Late: {s.late}
          </div>
        ))}
      </div>

    </div>
  );
}