"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ControlFinal() {
  const [data, setData] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/staff").then((res) => res.json()),
      fetch("/api/monthly").then((res) => res.json()),
    ])
      .then(([staffData, monthlyData]) => {
        setData(staffData);
        setMonthly(monthlyData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 🔥 PERFORMANCE ENGINE (AUTO)
  const calculatePerformance = () => {
    if (!data) return { level: "LOADING", score: 0 };

    const foh = data.fohScore || 0;
    const bar = data.barScore || 0;
    const kitchen = data.kitchenScore || 0;

    const avgScore = Math.round((foh + bar + kitchen) / 3);

    let level = "GOOD";
    if (avgScore < 40) level = "CRITICAL";
    else if (avgScore < 70) level = "WARNING";
    else if (avgScore >= 100) level = "EXCELLENT";

    return { level, score: avgScore };
  };

  // 🔥 SERVICE ENGINE (AUTO)
  const calculateServicePool = () => {
    if (!data) return 0;
    const rate = (monthly?.level || 5) / 100;
    return Math.round((data.revenue || 0) * rate);
  };

  // 🔥 PAYOUT ENGINE (AUTO)
  const calculatePayoutPool = (servicePool) => {
    if (!data) return 0;

    const performance = calculatePerformance();

    let multiplier = 1;
    if (performance.level === "CRITICAL") multiplier = 0.2;
    if (performance.level === "WARNING") multiplier = 0.7;
    if (performance.level === "GOOD") multiplier = 1;

    return Math.round(servicePool * multiplier);
  };

  const performance = calculatePerformance();
  const servicePool = calculateServicePool();
  const payoutPool = calculatePayoutPool(servicePool);

  // 🔥 LOCK DAY (CORE SYSTEM FUNCTION)
  const lockDay = async () => {
    if (!data) return;

    setSaving(true);

    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: new Date().toISOString(),

          // CORE FINANCIALS
          revenue: data.revenue,
          servicePool,
          payoutPool,

          // PERFORMANCE
          performanceLevel: performance.level,
          performanceScore: performance.score,
          fohScore: data.fohScore,
          barScore: data.barScore,
          kitchenScore: data.kitchenScore,

          // STAFF SNAPSHOT
          staff: data.staffWithPayout,

          // MONTHLY SYSTEM
          serviceLevel: monthly?.level || 5,
        }),
      });

      if (!res.ok) {
        alert("Failed to save day");
      } else {
        alert("Day locked and saved");
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

        {/* HERO */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="text-sm text-white/50">Revenue</div>
          <div className="text-4xl mt-2">
            {loading ? "..." : `${data?.revenue || 0} THB`}
          </div>
        </div>

        {/* KPI */}
        <div className="grid md:grid-cols-3 gap-4">

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm text-white/50">Service Pool</div>
            <div className="text-xl mt-1">
              {loading ? "..." : `${servicePool} THB`}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm text-white/50">Payout Pool</div>
            <div className="text-xl mt-1">
              {loading ? "..." : `${payoutPool} THB`}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm text-white/50">Performance</div>
            <div className="text-xl mt-1">
              {loading ? "..." : performance.level}
            </div>
          </div>

        </div>

        {/* MONTHLY SYSTEM */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-sm text-white/50">Monthly Service Level</div>
          <div className="text-2xl mt-2">
            {monthly ? `${monthly.level}%` : "..."}
          </div>
          <div className="text-white/50 text-sm">
            Avg Score: {monthly?.avgScore || "..."}
          </div>
        </div>

        {/* STAFF */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="text-lg">Staff Payout</div>

          {loading && <div className="text-white/50">Loading...</div>}

          {!loading &&
            data?.staffWithPayout?.map((s, i) => (
              <div
                key={i}
                className="flex justify-between border-b border-white/10 pb-2"
              >
                <div>{s.name}</div>
                <div>{s.payrollAmount} THB</div>
              </div>
            ))}
        </div>

        {/* ACTION */}
        <button
          onClick={lockDay}
          disabled={saving}
          className="bg-[#ff7a00] px-6 py-3 rounded-xl text-white hover:brightness-110 transition disabled:opacity-50"
        >
          {saving ? "Locking..." : "Lock Day"}
        </button>

      </div>
    </AppShell>
  );
}