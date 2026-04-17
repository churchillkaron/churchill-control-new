"use client";

import AppShell from "../AppShell";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="space-y-10">
        
        {/* HEADER */}
        <div>
          <h1 className="text-2xl text-white/80">Dashboard</h1>
        </div>

        {/* HERO KPI (DOMINANT) */}
        <div className="relative">
          {/* Glow behind */}
          <div className="absolute -inset-4 rounded-[28px] bg-[#ff7a00]/10 blur-2xl" />

          <div className="relative rounded-[28px] border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_25px_70px_rgba(0,0,0,0.45)] p-8 md:p-10">
            
            <div className="flex flex-col gap-4">
              <span className="text-white/60 text-sm">Today Revenue</span>

              <h2 className="text-6xl font-semibold tracking-tight">
                ฿128,400
              </h2>

              <span className="text-white/50 text-sm">
                +12% vs yesterday
              </span>
            </div>

          </div>
        </div>

        {/* KPI STRIP */}
        <div className="grid grid-cols-3 gap-6">
          
          {[
            { label: "Orders", value: "342" },
            { label: "Avg Order", value: "฿375" },
            { label: "FOH Score", value: "GOOD" },
          ].map((item, i) => (
            <div
              key={i}
              className="relative rounded-[22px] border border-white/10 bg-white/[0.05] backdrop-blur-lg p-6 shadow-[0_15px_40px_rgba(0,0,0,0.35)]"
            >
              <div className="flex flex-col gap-2">
                <span className="text-white/60 text-sm">{item.label}</span>
                <span className="text-2xl font-semibold">
                  {item.value}
                </span>
              </div>
            </div>
          ))}

        </div>

        {/* TRENDS (LOW PRIORITY) */}
        <div className="relative rounded-[26px] border border-white/10 bg-white/[0.04] backdrop-blur-md p-6 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
          <div className="text-white/70 text-sm mb-4">Last 3 Days</div>

          <div className="h-32 flex items-center justify-center text-white/30 text-sm">
            Trend chart placeholder
          </div>
        </div>

        {/* AI INSIGHT (SUBTLE) */}
        <div className="relative rounded-[22px] border border-[#ff7a00]/20 bg-[#ff7a00]/5 backdrop-blur-md p-5 shadow-[0_10px_25px_rgba(0,0,0,0.25)]">
          <p className="text-sm text-[#ff7a00]/80">
            Slight drop in average order value detected. Monitor upselling.
          </p>
        </div>

      </div>
    </AppShell>
  );
}