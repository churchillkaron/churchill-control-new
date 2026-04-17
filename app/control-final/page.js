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

        {/* HERO */}
        <div className="relative">

          {/* glow */}
          <div className="absolute -inset-8 bg-[#ff7a00]/12 blur-3xl rounded-[40px]" />

          <div className="relative rounded-[32px] border border-white/10 bg-white/[0.08] backdrop-blur-xl px-12 py-12
            shadow-[0_60px_160px_rgba(0,0,0,0.8),0_20px_60px_rgba(0,0,0,0.6)]
          ">

            {/* top highlight */}
            <div className="absolute inset-x-0 top-0 h-px bg-white/30" />

            <div className="flex justify-between items-center">

              <div>
                <div className="text-white/50 text-sm mb-3">
                  Today Revenue
                </div>

                <div className="text-6xl font-semibold tracking-tight">
                  THB 128,400
                </div>

                <div className="text-white/40 text-sm mt-2">
                  Service Charge Pool: THB 6,420
                </div>
              </div>

              <div className="relative">
                <div className="absolute -inset-3 bg-[#ff7a00]/30 blur-xl rounded-xl" />

                <button className="relative px-8 py-4 bg-[#ff7a00] text-black rounded-xl text-lg font-medium
                  shadow-[0_20px_50px_rgba(0,0,0,0.6)] hover:scale-[1.03] transition
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

              <div className="absolute -inset-3 bg-white/5 blur-xl rounded-[24px]" />

              <div className="relative rounded-[24px] border border-white/10 bg-white/[0.06] backdrop-blur-lg p-6
                shadow-[0_25px_60px_rgba(0,0,0,0.6)]
              ">
                <div className="absolute inset-x-0 top-0 h-px bg-white/20" />

                <div className="text-white/50 text-xs mb-1">
                  {item.label}
                </div>

                <div className="text-2xl font-medium">
                  {item.value}
                </div>

              </div>
            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}