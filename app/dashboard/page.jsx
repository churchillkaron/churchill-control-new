"use client";

import AppShell from "../AppShell";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="space-y-12">

        {/* HEADER */}
        <div>
          <h1 className="text-3xl font-medium text-white/90">
            Manager System
          </h1>
          <p className="text-white/50 text-sm">
            Real-time performance & control overview
          </p>
        </div>

        {/* HERO */}
        <div className="relative">
          <div className="absolute -inset-6 rounded-[32px] bg-[#ff7a00]/10 blur-3xl" />

          <div className="relative rounded-[28px] border border-white/10 bg-white/[0.06] backdrop-blur-xl p-10 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
            <div className="text-white/50 text-sm mb-3">
              Today Revenue
            </div>

            <div className="text-6xl font-semibold tracking-tight">
              THB 128,400
            </div>

            <div className="text-white/40 text-sm mt-2">
              +12% vs yesterday
            </div>
          </div>
        </div>

        {/* KPI STRIP */}
        <div className="grid grid-cols-3 gap-6">
          {[
            { label: "Orders", value: "342" },
            { label: "Avg Order", value: "THB 375" },
            { label: "FOH Score", value: "GOOD" },
          ].map((item, index) => (
            <div key={index} className="relative">
              <div className="absolute -inset-2 bg-white/5 blur-xl rounded-[20px]" />

              <div className="relative rounded-[20px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="text-white/50 text-xs mb-1">
                  {item.label}
                </div>
                <div className="text-xl font-medium">
                  {item.value}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* TRENDS */}
        <div className="relative">
          <div className="absolute -inset-4 bg-white/5 blur-2xl rounded-[24px]" />

          <div className="relative rounded-[24px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
            <div className="text-white/60 text-sm mb-4">
              Last 3 Days
            </div>

            <div className="space-y-2 text-white/40 text-sm">
              <div className="flex justify-between">
                <span>Day 1</span>
                <span>THB 9953</span>
              </div>
              <div className="flex justify-between">
                <span>Day 2</span>
                <span>THB 12720</span>
              </div>
              <div className="flex justify-between">
                <span>Day 3</span>
                <span>THB 4508</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}