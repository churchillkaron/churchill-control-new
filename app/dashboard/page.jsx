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

        staffMap[s.name].revenue += Number(s.revenue);
        staffMap[s.name].payout += Number(s.payout);
      });
    });

    let result = Object.entries(staffMap).map(([name, data]) => {
      let level = 5;

      if (data.revenue >= 100000) level = 7;
      else if (data.revenue >= 50000) level = 6;

      return {
        name,
        revenue: data.revenue,
        payout: data.payout,
        level,
      };
    });

    result.sort((a, b) => b.revenue - a.revenue);
    setLeaderboard(result);

    // =========================
    // ATTENDANCE LOAD
    // =========================
    const attendanceData =
      JSON.parse(localStorage.getItem("attendance")) || [];

    setAttendance(attendanceData);
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

      {/* ATTENDANCE */}
      <h1 className="text-3xl mb-6">Late Staff Review</h1>

      {attendance.filter(a => a.late).map((a, i) => (
        <div key={i} className="mb-4 p-4 bg-white/10 rounded-xl">

          <div><strong>{a.name}</strong> ({a.role})</div>
          <div>Time: {a.time}</div>
          <div>Reason: {a.reason}</div>

          <div className="mt-2">
            Status:{" "}
            {a.approved === true
              ? "✅ Approved"
              : a.approved === false
              ? "❌ Rejected"
              : "Pending"}
          </div>

          <div className="mt-3 space-x-2">
            <button
              onClick={() => updateApproval(i, true)}
              className="px-3 py-1 bg-green-500 rounded"
            >
              Approve
            </button>

            <button
              onClick={() => updateApproval(i, false)}
              className="px-3 py-1 bg-red-500 rounded"
            >
              Reject
            </button>
          </div>

        </div>
      ))}

      {/* LEADERBOARD */}
      <h1 className="text-3xl mb-6 mt-10">Individual Performance</h1>

      {leaderboard.map((s, i) => (
        <div key={i} className="mb-3">
          #{i + 1} {s.name}
          <br />
          Revenue: THB {s.revenue.toLocaleString()}
        </div>
      ))}

    </div>
  );
}