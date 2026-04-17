"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [monthlyData, setMonthlyData] = useState({
    avgScore: 0,
    days: 0,
    serviceCharge: 5,
  });
  const [attendance, setAttendance] = useState([]);
  const [staffFlags, setStaffFlags] = useState([]);
  const [staffActions, setStaffActions] = useState({});

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem("history")) || [];

    // =========================
    // MONTHLY SYSTEM
    // =========================
    const sorted = [...history].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    const last30 = sorted.slice(0, 30);

    if (last30.length > 0) {
      const scores = last30.map((day) => day.scores?.foh || 0);

      const avgScore =
        scores.reduce((sum, val) => sum + val, 0) / scores.length;

      let serviceCharge = 5;
      if (avgScore >= 70 && avgScore < 85) serviceCharge = 6;
      else if (avgScore >= 85) serviceCharge = 7;

      setMonthlyData({
        avgScore: avgScore.toFixed(1),
        days: last30.length,
        serviceCharge,
      });
    }

    // =========================
    // LEADERBOARD
    // =========================
    const staffMap = {};

    history.forEach((day) => {
      if (!day.staff) return;

      day.staff.forEach((s) => {
        if (!staffMap[s.name]) {
          staffMap[s.name] = {
            revenue: 0,
            payout: 0,
          };
        }

        staffMap[s.name].revenue += Number(s.revenue || 0);
        staffMap[s.name].payout += Number(s.payout || 0);
      });
    });

    const result = Object.entries(staffMap).map(([name, data]) => ({
      name,
      revenue: data.revenue,
      payout: data.payout,
    }));

    result.sort((a, b) => b.revenue - a.revenue);
    setLeaderboard(result);

    // =========================
    // ATTENDANCE
    // =========================
    const attendanceData =
      JSON.parse(localStorage.getItem("attendance")) || [];
    setAttendance(attendanceData);

    // =========================
    // FLAGS
    // =========================
    const flagMap = {};

    history.forEach((day) => {
      if (!day.staff) return;

      day.staff.forEach((staff) => {
        if (!flagMap[staff.name]) {
          flagMap[staff.name] = { badDays: 0, totalDays: 0 };
        }

        flagMap[staff.name].totalDays += 1;

        if (Number(staff.level) < 1) {
          flagMap[staff.name].badDays += 1;
        }
      });
    });

    const flags = Object.entries(flagMap)
      .map(([name, data]) => {
        let status = "Stable";

        if (data.badDays >= 5) status = "Review Required";
        else if (data.badDays >= 3) status = "Warning";

        return { name, ...data, status };
      })
      .filter((s) => s.badDays >= 3)
      .sort((a, b) => b.badDays - a.badDays);

    setStaffFlags(flags);

    // =========================
    // LOAD ACTIONS
    // =========================
    const actions =
      JSON.parse(localStorage.getItem("staffActions")) || {};
    setStaffActions(actions);
  }, []);

  // =========================
  // APPROVE / REJECT
  // =========================
  const updateApproval = (index, value) => {
    const updated = [...attendance];
    updated[index].approved = value;

    localStorage.setItem("attendance", JSON.stringify(updated));
    setAttendance(updated);
  };

  // =========================
  // ACTION UPDATE
  // =========================
  const updateAction = (name, action) => {
    const updated = { ...staffActions, [name]: action };
    localStorage.setItem("staffActions", JSON.stringify(updated));
    setStaffActions(updated);
  };

  return (
    <div className="min-h-screen text-white p-10">

      {/* MONTHLY */}
      <h1 className="text-3xl mb-6">Monthly System Performance</h1>
      <div className="bg-white/10 p-6 rounded-xl mb-10">
        <p>Days: {monthlyData.days}</p>
        <p>Avg Score: {monthlyData.avgScore}</p>
        <p>
          Service Charge:{" "}
          <span className="text-orange-400">
            {monthlyData.serviceCharge}%
          </span>
        </p>
      </div>

      {/* FLAGS + ACTIONS */}
      <h1 className="text-3xl mb-6">Manager Actions</h1>

      {staffFlags.map((staff, i) => (
        <div key={i} className="mb-4 p-4 bg-white/10 rounded-xl">
          <div><strong>{staff.name}</strong></div>
          <div>Bad Days: {staff.badDays}</div>

          <div className="mt-2">
            System Status: {staff.status}
          </div>

          <div className="mt-2">
            Action:{" "}
            <span className="text-orange-400">
              {staffActions[staff.name] || "None"}
            </span>
          </div>

          <div className="mt-3 space-x-2">
            <button onClick={() => updateAction(staff.name, "Warning Issued")} className="bg-yellow-500 px-2 py-1 rounded">
              Warning
            </button>
            <button onClick={() => updateAction(staff.name, "Under Review")} className="bg-orange-500 px-2 py-1 rounded">
              Review
            </button>
            <button onClick={() => updateAction(staff.name, "Final Warning")} className="bg-red-500 px-2 py-1 rounded">
              Final
            </button>
            <button onClick={() => updateAction(staff.name, "Cleared")} className="bg-green-500 px-2 py-1 rounded">
              Clear
            </button>
          </div>
        </div>
      ))}

      {/* ATTENDANCE */}
      <h1 className="text-3xl mb-6 mt-10">Late Staff Review</h1>

      {attendance.filter(a => a.late).map((a, i) => (
        <div key={i} className="mb-4 p-4 bg-white/10 rounded-xl">
          <div><strong>{a.name}</strong></div>
          <div>Reason: {a.reason}</div>

          <div className="mt-2">
            {a.approved === true ? "Approved" :
             a.approved === false ? "Rejected" : "Pending"}
          </div>

          <button onClick={() => updateApproval(i, true)} className="bg-green-500 px-2 py-1 mr-2 rounded">Approve</button>
          <button onClick={() => updateApproval(i, false)} className="bg-red-500 px-2 py-1 rounded">Reject</button>
        </div>
      ))}

      {/* LEADERBOARD */}
      <h1 className="text-3xl mb-6 mt-10">Performance</h1>

      {leaderboard.map((s, i) => (
        <div key={i}>
          #{i + 1} {s.name} - THB {s.revenue.toLocaleString()}
        </div>
      ))}
    </div>
  );
}