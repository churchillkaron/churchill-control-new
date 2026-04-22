"use client";

import AppShell from "../../AppShell.js";
import Link from "next/link";

export default function StaffPerformancePage() {
  return (
    <AppShell>
      <div className="space-y-8 text-white">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl">Performance</h1>
          <Link
            href="/staff"
            className="text-sm text-white/60 hover:text-white transition"
          >
            Back to Staff Portal
          </Link>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-xl text-white">Personal Performance</div>
          <div className="text-white/50 text-sm mt-2">
            This page is reserved for staff performance, scores, warnings, and improvement tracking.
          </div>
        </div>
      </div>
    </AppShell>
  );
}