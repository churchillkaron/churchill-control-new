"use client";

import AppShell from "../AppShell";

export default function POS() {
  return (
    <AppShell>
      <div className="space-y-6">

        <div>
          <h1 className="text-3xl font-semibold">POS System</h1>
          <p className="text-white/50">Order management</p>
        </div>

        <div className="rounded-2xl border border-white/10 p-6 bg-white/[0.05]">
          POS Loaded Successfully
        </div>

      </div>
    </AppShell>
  );
}