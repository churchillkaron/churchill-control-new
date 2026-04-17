"use client";

import AppShell from "../AppShell";

export default function POSControlPage() {
  return (
    <AppShell>
      <div className="space-y-16">

        {/* HEADER */}
        <div className="space-y-3">
          <div className="text-xs tracking-widest text-white/30">
            CHURCHILL CONTROL SYSTEM V6
          </div>

          <h1 className="text-4xl md:text-5xl font-semibold text-white/90">
            POS Control
          </h1>

          <p className="text-white/50 text-sm max-w-xl leading-relaxed">
            Revenue, orders, average ticket, cost, and performance analysis.
            Connected to saved operating history.
          </p>
        </div>

        {/* HERO (DOMINANT) */}
        <div className="relative">
          <div className="absolute -inset-8 bg-[#ff7a00]/15 blur-3xl rounded-[40px]" />

          <div className="relative rounded-[36px] border border-white/10 bg-white/[0.06] backdrop-blur-2xl px-10 py-14
            shadow-[0_60px_140px_rgba(0,0,0,0.75),0_20px_60px_rgba(0,0,0,0.5)]"
          >
            <div className="space-y-4">

              <div className="text-sm text-white/40">
                Total Revenue (Selected Day)
              </div>

              <div className="text-6xl md:text-7xl font-semibold tracking-tight">
                THB 0
              </div>

              <div className="text-white/40 text-sm">
                Waiting for data connection
              </div>

            </div>
          </div>
        </div>

        {/* KPI STRIP */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {[
            { label: "Orders", value: "-" },
            { label: "Avg Order", value: "-" },
            { label: "Cost %", value: "-" },
          ].map((item, i) => (
            <div key={i} className="relative">

              <div className="absolute -inset-3 bg-white/5 blur-2xl rounded-[24px]" />

              <div className="relative rounded-[24px] border border-white/10 bg-white/[0.05] p-7
                shadow-[0_25px_60px_rgba(0,0,0,0.55)]"
              >
                <div className="text-white/40 text-xs mb-2">
                  {item.label}
                </div>

                <div className="text-2xl font-medium">
                  {item.value}
                </div>
              </div>

            </div>
          ))}

        </div>

        {/* INSIGHT / EMPTY STATE */}
        <div className="relative">

          <div className="absolute -inset-2 bg-white/5 blur-xl rounded-xl" />

          <div className="relative text-white/40 text-sm px-5 py-4 rounded-xl border border-white/10 bg-white/[0.03]">
            No historical data loaded yet. Complete at least one operating day
            in Control Final to unlock performance analytics.
          </div>

        </div>

      </div>
    </AppShell>
  );
}