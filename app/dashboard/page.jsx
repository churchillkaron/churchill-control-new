"use client";

import AppShell from "../AppShell";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="space-y-14">

        {/* HEADER */}
        <div className="space-y-2">
          <h1 className="text-3xl font-medium text-white/90">
            Manager System
          </h1>
          <p className="text-white/50 text-sm">
            Real-time performance & control overview
          </p>
        </div>

        {/* HERO KPI */}
        <div className="relative">
          {/* Ambient glow */}
          <div className="absolute -inset-6 rounded-[36px] bg-[#ff7a00]/12 blur-3xl" />

          <div className="relative rounded-[32px] border border-white/10 bg-white/[0.07] backdrop-blur-xl px-10 py-12
            shadow-[0_40px_120px_rgba(0,0,0,0.65),0_12px_40px_rgba(0,0,0,0.45)]
          ">
            
            {/* top highlight */}
            <div className="absolute inset-x-0 top-0 h-px bg-white/30 rounded-t-[32px]" />

            <div className="space-y-4">
              <span className="text-white/50 text-sm">Today’s Revenue</span>

              <h2 className="text-6xl md:text-7xl font-semibold tracking-tight">
                THB 9953
              </h2>

              <span className="text-white/40 text-sm">
                +12% vs yesterday
              </span>
            </div>
          </div>
        </div>

        {/* KPI STRIP */}
        <div className="grid grid-cols-3 gap-8">
          {[
            { label: "Orders", value: "—" },
            { label: "Avg Order", value: "THB 1422" },
            { label: "FOH Score", value: "—" },
          ].map((item, i) => (
            <div key={i} className="relative group">
              
              {/* hover glow */}
              <div className="absolute -inset-2 rounded-[24px] bg-white/5 opacity-0 group-hover:opacity-100 blur-xl transition duration-500" />

              <div className="relative rounded-[24px] border border-white/10 bg-white/[0.05] backdrop-blur-lg px-6 py-6
                shadow-[0_20px_50px_rgba(0,0,0,0.45)]
              ">
                <div className="absolute inset-x-0 top-0 h-px bg-white/20" />

                <div className="space-y-2">
                  <span className="text-white/50 text-xs tracking-wide">
                    {item.label}
                  </span>
                  <span className="text-2xl font-medium">
                    {item.value}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* TRENDS */}
        <div className="relative">
          {/* separation glow */}
          <div className="absolute -inset-4 rounded-[28px] bg-white/[0.04] blur-2xl" />

          <div className="relative rounded-[28px] border border-white/10 bg-white/[0.045] backdrop-blur-md p-8
            shadow-[0_25px_70px_rgba(0,0,0,0.5)]
          ">
            <div className="text-white/60 text-sm mb-6">
              Last 3 Days
            </div>

            <div className="space-y-3 text-white/40 text-sm">
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

        {/* AI INSIGHT */}
        <div className="relative">
          <div className="absolute -inset-2 rounded-[20px] bg-[#ff7a00]/10 blur-xl" />

          <div className="relative rounded-[20px] border border-[#ff7a00]/20 bg-[#ff7a00]/10 backdrop-blur-md px-5 py-4
            shadow-[0_15px_40px_rgba(0,0,0,0.4)]
          ">
            <p className="text-sm text-[#ff7a00]/90">
              Avg order value is decreasing — consider upsell focus
            </p>
          </div>
        </div>

      </div>
    </AppShell>
  );
}