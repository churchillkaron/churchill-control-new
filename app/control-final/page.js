"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ControlFinal() {
  const [revenueData, setRevenueData] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/revenue").then((res) => res.json()),
      fetch("/api/monthly").then((res) => res.json()),
      fetch("/api/staff").then((res) => res.json()),
    ])
      .then(([rev, monthlyData, staffData]) => {
        setRevenueData(rev);
        setMonthly(monthlyData);
        setStaff(staffData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 🔥 PERFORMANCE ENGINE
  const calculatePerformance = () => {
    if (!staff) return { level: "LOADING", score: 0 };

    const foh = staff.fohScore || 0;
    const bar = staff.barScore || 0;
    const kitchen = staff.kitchenScore || 0;

    const avg = Math.round((foh + bar + kitchen) / 3);

    let level = "GOOD";
    if (avg < 40) level = "CRITICAL";
    else if (avg < 70) level = "WARNING";

    return { level, score: avg };
  };

  const performance = calculatePerformance();

  // 🔥 SERVICE ENGINE
  const servicePool = Math.round(
    (revenueData?.revenue || 0) * ((monthly?.level || 5) / 100)
  );

  // 🔥 PAYOUT ENGINE
  const payoutMultiplier =
    performance.level === "CRITICAL"
      ? 0.2
      : performance.level === "WARNING"
      ? 0.7
      : 1;

  const payoutPool = Math.round(servicePool * payoutMultiplier);

  // 🔥 LOCK DAY (REAL DATA NOW)
  const lockDay = async () => {
    setSaving(true);

    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: new Date().toISOString(),

          revenue: revenueData?.revenue || 0,
          orderCount: revenueData?.orderCount || 0,
          avgOrderValue: revenueData?.avgOrderValue || 0,

          servicePool,
          payoutPool,

          performanceLevel: performance.level,
          performanceScore: performance.score,

          fohScore: staff?.fohScore,
          barScore: staff?.barScore,
          kitchenScore: staff?.kitchenScore,

          staff: staff?.staffWithPayout || [],

          serviceLevel: monthly?.level || 5,
        }),
      });

      if (!res.ok) {
        alert("Failed to save day");
      } else {
        alert("Day locked (REAL DATA)");
      }
    } catch (err) {
      alert("Error saving day");
    }

    setSaving(false);
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Control Final</h1>

        {/* REVENUE */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="text-sm text-white/50">Revenue (REAL)</div>
          <div className="text-4xl mt-2">
            {loading ? "..." : `${revenueData?.revenue || 0} THB`}
          </div>
          <div className="text-xs text-white/50 mt-2">
            Orders: {revenueData?.orderCount || 0} | Avg:{" "}
            {revenueData?.avgOrderValue || 0}
          </div>
        </div>

        {/* KPI */}
        <div className="grid md:grid-cols-3 gap-4">

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm text-white/50">Service Pool</div>
            <div className="text-xl mt-1">{servicePool} THB</div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm text-white/50">Payout Pool</div>
            <div className="text-xl mt-1">{payoutPool} THB</div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm text-white/50">Performance</div>
            <div className="text-xl mt-1">{performance.level}</div>
          </div>

        </div>

        {/* ACTION */}
        <button
          onClick={lockDay}
          disabled={saving}
          className="bg-[#ff7a00] px-6 py-3 rounded-xl text-white"
        >
          {saving ? "Locking..." : "Lock Day"}
        </button>

      </div>
    </AppShell>
  );
}