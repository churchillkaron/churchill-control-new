"use client";

import Link from "next/link";
import AppShell from "../AppShell";

export default function StaffPortal() {
  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Staff Portal</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* AI INVOICE */}
          <Link
            href="/staff/invoices"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl">📸 Submit Invoice</div>
            <div className="text-white/50 text-sm mt-2">
              Take photo of bill and send to accounting
            </div>
          </Link>

          {/* ATTENDANCE */}
          <Link
            href="/management/attendance"
            className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
          >
            <div className="text-xl">⏱ Attendance</div>
            <div className="text-white/50 text-sm mt-2">
              Check in / check out
            </div>
          </Link>

          {/* GOOGLE REVIEWS (placeholder) */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 opacity-50">
            <div className="text-xl">⭐ Google Reviews</div>
            <div className="text-white/50 text-sm mt-2">
              (Coming next)
            </div>
          </div>

          {/* MORE FUTURE FEATURES */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 opacity-50">
            <div className="text-xl">📊 Tasks / KPIs</div>
            <div className="text-white/50 text-sm mt-2">
              (Future system)
            </div>
          </div>

        </div>

      </div>
    </AppShell>
  );
}