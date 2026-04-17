"use client";

import { useEffect, useState } from "react";

export default function ControlFinal() {
  const [revenue, setRevenue] = useState(0);

  // ✅ LOAD REVENUE FROM POS
  useEffect(() => {
    const posRevenue = localStorage.getItem("posRevenue");
    if (posRevenue) {
      setRevenue(Number(posRevenue));
    }
  }, []);

  // ✅ SAVE DAY TO HISTORY
  const handleSaveDay = () => {
    const existing = JSON.parse(localStorage.getItem("history")) || [];

    const newDay = {
      date: new Date().toLocaleDateString(),
      revenue: revenue,
    };

    const updated = [newDay, ...existing];

    localStorage.setItem("history", JSON.stringify(updated));

    alert("Day saved successfully");
  };

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          alt="Control background"
          className="w-full h-full object-cover"
        />
      </div>

      {/* OVERLAY */}
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.75),rgba(18,12,8,0.85))]" />

      {/* GLOW */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(255,140,0,0.15),transparent_40%)]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 pt-28 pb-14 space-y-8">

        {/* HEADER */}
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            Control
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Control Final
          </h1>
        </div>

        {/* AUTO REVENUE DISPLAY */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 md:p-8 space-y-4">

          <p className="text-sm text-white/50">
            Live Revenue from POS
          </p>

          <h2 className="text-4xl font-semibold text-[#ffb36b]">
            THB {revenue.toLocaleString()}
          </h2>

          <button
            onClick={handleSaveDay}
            className="bg-[#ff7a00] px-6 py-3 rounded-xl text-white font-medium hover:opacity-90"
          >
            Save Day
          </button>

        </div>

      </div>
    </div>
  );
}