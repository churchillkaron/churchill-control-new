"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ControlFinal() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/staff")
      .then((res) => res.json())
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
          revenue: data.revenue,
          servicePool: data.servicePool,
          payoutPool: data.payoutPool,
          payoutStatus: data.payoutStatus,
          fohScore: data.fohScore,
          barScore: data.barScore,
          kitchenScore: data.kitchenScore,
          staff: data.staffWithPayout,
        }),
      });

      if (!res.ok) {
        alert("Failed to save day");
      } else {
        alert("Day locked and saved to history");
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
          <div className="text-sm text-white/50">Total Revenue</div>
          <div className="text-4xl mt-2">
            {loading ? "..." : `${data?.revenue || 0} THB`}
          </div>
        </div>

        {/* KPI */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm text-white/50">Service Pool</div>
            <div className="text-xl mt-1">
              {loading ? "..." : `${data?.servicePool || 0} THB`}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm text-white/50">Payout Pool</div>
            <div className="text-xl mt-1">
              {loading ? "..." : `${data?.payoutPool || 0} THB`}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm text-white/50">Performance</div>
            <div className="text-xl mt-1">
              {loading ? "..." : data?.payoutStatus}
            </div>
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