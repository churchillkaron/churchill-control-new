"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [history, setHistory] = useState([]);
  const [staffTotals, setStaffTotals] = useState({});
  const [reviewStats, setReviewStats] = useState([]);

  const [monthlyScore, setMonthlyScore] = useState(0);
  const [serviceLevel, setServiceLevel] = useState(0.05);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const data =
      JSON.parse(localStorage.getItem("history") || "[]");

    setHistory(data);

    // 🔥 STAFF TOTALS
    const totals = {};
    data.forEach((day) => {
      day.staff?.forEach((s) => {
        if (!totals[s.name]) totals[s.name] = 0;
        totals[s.name] += s.payout;
      });
    });
    setStaffTotals(totals);

    // 🔥 LAST 30 DAYS PERFORMANCE
    const last30 = data.slice(-30);

    const avgScore =
      last30.reduce((sum, d) => sum + (d.finalScore || 0), 0) /
      (last30.length || 1);

    setMonthlyScore(avgScore);

    let level = 0.05;
    if (avgScore >= 25) level = 0.07;
    else if (avgScore >= 15) level = 0.06;

    setServiceLevel(level);

    // 🔥 LEADERBOARD (LAST DAY)
    const latest = data[data.length - 1] || {};
    const staffNames = ["FOH 1", "FOH 2", "BAR", "KITCHEN"];

    const stats = staffNames.map((name) => {
      const s = latest.staff?.find((x) => x.name === name);

      return {
        name,
        payout: s?.payout || 0,
      };
    });

    stats.sort((a, b) => b.payout - a.payout);
    setReviewStats(stats);

  }, []);

  const totalRevenue = history.reduce(
    (sum, d) => sum + (d.revenue || 0),
    0
  );

  const totalService = history.reduce(
    (sum, d) => sum + (d.serviceCharge || 0),
    0
  );

  const totalDays = history.length;

  return (
    <AppShell>
      <div className="space-y-10">

        <div>
          <h1 className="text-3xl text-white/90">
            Manager Dashboard
          </h1>
          <p className="text-white/50 text-sm">
            Monthly control and payroll overview
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card label="Revenue" value={`THB ${totalRevenue}`} />
          <Card label="Service Pool" value={`THB ${totalService}`} />
          <Card label="Days Closed" value={totalDays} />
        </div>

        {/* 🔥 MONTHLY PERFORMANCE */}
        <div className="bg-white/5 p-6 rounded-2xl">
          <h2 className="mb-4 text-white">30-Day Performance</h2>

          <p>Avg Score: {monthlyScore.toFixed(1)}</p>
          <p>Service Level: {(serviceLevel * 100).toFixed(0)}%</p>

          <p className="text-xs text-white/50 mt-2">
            {serviceLevel === 0.05 && "Reach 15+ to unlock 6%"}
            {serviceLevel === 0.06 && "Reach 25+ to unlock 7%"}
            {serviceLevel === 0.07 && "Max level reached"}
          </p>
        </div>

        {/* 🔥 DAILY LEADERBOARD */}
        <div className="bg-white/5 p-6 rounded-2xl">
          <h2 className="mb-4 text-white">Top Staff (Today)</h2>

          {reviewStats.map((s, i) => (
            <div
              key={s.name}
              className="flex justify-between border-b border-white/10 py-2"
            >
              <span>#{i + 1} {s.name}</span>
              <span>THB {Math.round(s.payout)}</span>
            </div>
          ))}
        </div>

        <div className="bg-white/5 p-6 rounded-2xl">
          <h2 className="mb-4 text-white">Staff Monthly Payout</h2>

          {Object.entries(staffTotals).map(([name, total]) => (
            <div
              key={name}
              className="flex justify-between border-b border-white/10 py-2"
            >
              <span>{name}</span>
              <span>THB {Math.round(total)}</span>
            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}

function Card({ label, value }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="text-white/50 text-sm">{label}</div>
      <div className="text-2xl mt-2">{value}</div>
    </div>
  );
}