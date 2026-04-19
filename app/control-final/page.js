"use client";

import AppShell from "../AppShell";

export default function ControlFinal() {
  return (
    <AppShell>
      <div className="space-y-10 text-white">

        {/* Title */}
        <h1 className="text-3xl">Control Final</h1>

        {/* Main Card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">

          <div className="text-lg text-white">
            End of Day Control
          </div>

          <div className="text-white/50 text-sm">
            Review performance, finalize service charge, and close the day.
          </div>

          {/* Placeholder metrics */}
          <div className="grid md:grid-cols-3 gap-4">

            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-sm text-white/50">Revenue</div>
              <div className="text-xl mt-1">—</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-sm text-white/50">Service Charge</div>
              <div className="text-xl mt-1">—</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-sm text-white/50">Staff Performance</div>
              <div className="text-xl mt-1">—</div>
            </div>

          </div>

          {/* Action */}
          <button className="bg-[#ff7a00] px-6 py-3 rounded-xl text-white hover:brightness-110 transition">
            Close Day
          </button>

        </div>

      </div>
    </AppShell>
  );
}