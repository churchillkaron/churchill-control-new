"use client";

export const dynamic = "force-dynamic";

import AppShell from "../AppShell";

export default function ControlFinalPage() {
  return (
    <AppShell>
      <div className="space-y-10">

        <h1 className="text-2xl text-white/80">
          Control Final
        </h1>

        <div className="text-5xl font-semibold">
          THB 128,400
        </div>

        <button className="px-6 py-3 bg-[#ff7a00] text-black rounded-lg">
          Close Day
        </button>

      </div>
    </AppShell>
  );
}
