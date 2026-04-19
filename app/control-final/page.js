"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function ControlFinal() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/staff") // your existing backend
      .then((res) => res.json())
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const lockDay = () => {
    alert("Day locked (next step: save to history)");
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        {/* Title */}
        <h1 className="text-3xl">Control Final</h1>

        {/* HERO */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="text-sm text-white/50">Total Revenue</div>
          <div className="text-4xl mt-2">
            {loading ? "..." : `${data?.revenue || 0} THB`}
          </div>
        </div>

        {/* KPI STRIP */}
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

        {/* PERFORMANCE BREAKDOWN */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="text-lg">Department Performance</div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <div className="text-white/50 text-sm">FOH</div>
              <div className="text-xl">{data?.fohScore || 0}</div>
            </div>
            <div>
              <div className="text-white/50 text-sm">Bar</div>
              <div className="text-xl">{data?.barScore || 0}</div>
            </div>
            <div>
              <div className="text-white/50 text-sm">Kitchen</div>
              <div className="text-xl">{data?.kitchenScore || 0}</div>
            </div>
          </div>
        </div>

        {/* STAFF PAYOUT */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="text-lg">Staff Payout</div>

          {loading && <div className="text-white/50">Loading...</div>}

          {!loading && data?.staffWithPayout?.map((s, i) => (
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
          className="bg-[#ff7a00] px-6 py-3 rounded-xl text-white hover:brightness-110 transition"
        >
          Lock Day
        </button>

      </div>
    </AppShell>
  );
}