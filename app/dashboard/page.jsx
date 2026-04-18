"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [history, setHistory] = useState([]);
  const [staffTotals, setStaffTotals] = useState({});
  const [reviews, setReviews] = useState([]);
  const [reviewStats, setReviewStats] = useState([]);

  useEffect(() => {
    const data =
      JSON.parse(localStorage.getItem("history") || "[]");

    const reviewData =
      JSON.parse(localStorage.getItem("reviews") || "[]");

    setHistory(data);
    setReviews(reviewData);

    // 🔥 STAFF PAYOUT TOTALS
    const totals = {};

    data.forEach((day) => {
      day.staff?.forEach((s) => {
        if (!totals[s.name]) totals[s.name] = 0;
        totals[s.name] += s.payout;
      });
    });

    setStaffTotals(totals);

    // 🔥 REVIEW PERFORMANCE
    const staffNames = ["FOH 1", "FOH 2", "BAR", "KITCHEN"];

    const stats = staffNames.map((name) => {
      const r = reviewData.filter((x) => x.staff === name);

      const avg =
        r.reduce((sum, x) => sum + x.rating, 0) /
        (r.length || 1);

      return {
        name,
        avg,
        count: r.length,
      };
    });

    setReviewStats(stats);
  }, []);

  // 🔥 TOTALS
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

        {/* HEADER */}
        <div>
          <h1 className="text-3xl text-white/90">
            Manager Dashboard
          </h1>
          <p className="text-white/50 text-sm">
            Monthly control and payroll overview
          </p>
        </div>

        {/* TOTAL KPI */}
        <div className="grid md:grid-cols-3 gap-6">

          <Card label="Revenue" value={`THB ${totalRevenue}`} />
          <Card label="Service Pool" value={`THB ${totalService}`} />
          <Card label="Days Closed" value={totalDays} />

        </div>

        {/* 🔥 REVIEW PERFORMANCE */}
        <div className="bg-white/5 p-6 rounded-2xl">

          <h2 className="mb-4 text-white">Review Performance</h2>

          {reviewStats.map((s) => (
            <div
              key={s.name}
              className="flex justify-between border-b border-white/10 py-2"
            >
              <span>{s.name}</span>
              <span>
                ⭐ {s.avg.toFixed(2)} ({s.count})
              </span>
            </div>
          ))}

        </div>

        {/* STAFF PAYROLL */}
        <div className="bg-white/5 p-6 rounded-2xl">

          <h2 className="mb-4 text-white">Staff Monthly Payout</h2>

          {Object.keys(staffTotals).length === 0 && (
            <p className="text-white/40">No data</p>
          )}

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