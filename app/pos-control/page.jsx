"use client";

import AppShell from "../AppShell";

export default function POSControlPage() {
  return (
    <AppShell>
      <div className="space-y-14">

        {/* HEADER */}
        <div className="space-y-2">
          <div className="text-xs tracking-widest text-white/40">
            CHURCHILL CONTROL SYSTEM V6
          </div>

          <h1 className="text-3xl font-medium text-white/90">
            POS Control
          </h1>

          <p className="text-white/50 text-sm max-w-xl">
            Revenue, orders, average ticket, cost, and performance analysis.
            Connected to saved history data.
          </p>
        </div>

        {/* HERO BLOCK */}
        <div className="relative">
          <div className="absolute -inset-6 bg-[#ff7a00]/10 blur-3xl rounded-[32px]" />

          <div className="relative rounded-[28px] border border-white/10 bg-white/[0.06] backdrop-blur-xl p-10
            shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          >
            <div className="text-white/50 text-sm mb-3">
              Total Revenue (Selected Day)
            </div>

            <div className="text-5xl font-semibold tracking-tight">
              THB 0
            </div>

            <div className="text-white/40 text-sm mt-2">
              Waiting for data connection
            </div>
          </div>
        </div>

        {/* KPI STRIP */}
        <div className="grid grid-cols-3 gap-6">

          {[
            { label: "Orders", value: "-" },
            { label: "Avg Order", value: "-" },
            { label: "Cost %", value: "-" },
          ].map((item, i) => (
            <div key={i} className="relative">
              <div className="absolute -inset-2 bg-white/5 blur-xl rounded-[20px]" />

              <div className="relative rounded-[20px] border border-white/10 bg-white/[0.05] p-6
                shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
              >
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

        {/* EMPTY STATE */}
        <div className="text-white/40 text-sm">
          No historical data loaded yet.
        </div>

      </div>
    </AppShell>
  );
}