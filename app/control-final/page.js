"use client";

import AppShell from "../AppShell";

export default function ControlFinalPage() {
  return (
    <AppShell>
      <div className="space-y-14">

        {/* HEADER */}
        <div className="space-y-2">
          <h1 className="text-3xl font-medium text-white/90">
            Control Final
          </h1>
          <p className="text-white/50 text-sm">
            End-of-day control & payout decision system
          </p>
        </div>

        {/* HERO CONTROL BLOCK */}
        <div className="relative">

          {/* glow */}
          <div className="absolute -inset-6 rounded-[36px] bg-[#ff7a00]/12 blur-3xl" />

          <div className="relative rounded-[32px] border border-white/10 bg-white/[0.07] backdrop-blur-xl px-10 py-12
            shadow-[0_50px_140px_rgba(0,0,0,0.7),0_15px_50px_rgba(0,0,0,0.5)]
          ">

            {/* light edge */}
            <div className="absolute inset-x-0 top-0 h-px bg-white/30 rounded-t-[32px]" />

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">

              {/* LEFT */}
              <div className="space-y-4">
                <span className="text-white/50 text-sm">
                  Today Revenue
                </span>

                <h2 className="text-6xl font-semibold tracking-tight">
                  THB 128,400
                </h2>

                <span className="text-white/40 text-sm">
                  Service Charge Pool: THB 6,420
                </span>
              </div>

              {/* ACTION */}
              <div className="relative">
                <div className="absolute -inset-2 bg-[#ff7a00]/20 blur-xl rounded-xl" />

                <button className="relative px-8 py-4 rounded-xl bg-[#ff7a00] text-black font-medium text-lg
                  shadow-[0_15px_40px_rgba(0,0,0,0.6)] hover:scale-[1.02] transition
                ">
                  Close Day
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* KPI STRIP */}
        <div className="grid grid-cols-3 gap-8">

          {[
            { label: "Total Orders", value: "342" },
            { label: "Avg Order Value", value: "THB 375" },
            { label: "FOH Performance", value: "GOOD" },
          ].map((item, i) => (
            <div key={i} className="relative">

              <div className="absolute -inset-2 bg-white/5 blur-xl rounded-[24px]" />

              <div className="relative rounded-[24px] border border-white/10 bg-white/[0.05] backdrop-blur-lg p-6
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

        {/* DEPARTMENT PERFORMANCE */}
        <div className="relative">

          <div className="absolute -inset-4 bg-white/[0.04] blur-2xl rounded-[28px]" />

          <div className="relative rounded-[28px] border border-white/10 bg-white/[0.045] backdrop-blur-md p-8
            shadow-[0_25px_70px_rgba(0,0,0,0.5)]
          ">

            <div className="text-white/70 text-sm mb-6">
              Department Performance
            </div>

            <div className="grid grid-cols-3 gap-6">

              {[
                { name: "FOH", value: "GOOD" },
                { name: "BAR", value: "WARNING" },
                { name: "KITCHEN", value: "GOOD" },
              ].map((dep, i) => (
                <div key={i} className="rounded-[20px] border border-white/10 bg-white/[0.05] p-6 text-center
                  shadow-[0_15px_40px_rgba(0,0,0,0.4)]
                ">
                  <div className="text-white/50 text-xs mb-2">
                    {dep.name}
                  </div>
                  <div className="text-lg font-medium">
                    {dep.value}
                  </div>
                </div>
              ))}

            </div>

          </div>
        </div>

        {/* PAYOUT PREVIEW */}
        <div className="relative">

          <div className="absolute -inset-4 bg-[#ff7a00]/5 blur-2xl rounded-[28px]" />

          <div className="relative rounded-[28px] border border-white/10 bg-white/[0.045] backdrop-blur-md p-8
            shadow-[0_25px_70px_rgba(0,0,0,0.5)]
          ">

            <div className="text-white/70 text-sm mb-6">
              Payout Distribution Preview
            </div>

            <div className="space-y-4 text-sm text-white/60">

              <div className="flex justify-between">
                <span>FOH Pool</span>
                <span>THB 3,210</span>
              </div>

              <div className="flex justify-between">
                <span>BAR Pool</span>
                <span>THB 1,926</span>
              </div>

              <div className="flex justify-between">
                <span>KITCHEN Pool</span>
                <span>THB 1,284</span>
              </div>

            </div>

          </div>
        </div>

      </div>
    </AppShell>
  );
}