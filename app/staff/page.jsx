"use client";

import AppShell from "../AppShell";
import Link from "next/link";

export default function StaffPortal() {
  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Staff Portal</h1>

        <div className="grid md:grid-cols-2 gap-6">

          {/* PERFORMANCE → HISTORY */}
          <Link href="/history">
            <div className="card">⭐ Performance</div>
          </Link>

          {/* EARNINGS → PAYOUT */}
          <Link href="/payout">
            <div className="card">💰 Earnings</div>
          </Link>

          {/* ATTENDANCE → STAFF PAGE (we fix next) */}
          <Link href="/staff/attendance">
            <div className="card">⏱ Attendance</div>
          </Link>

          {/* AI INVOICE */}
          <Link href="/staff/invoice">
            <div className="card">🤖 AI Invoice</div>
          </Link>

          {/* GOOGLE REVIEWS */}
          <Link href="/staff/reviews">
            <div className="card">⭐📍 Google Reviews</div>
          </Link>

          {/* MESSAGES */}
          <Link href="/staff/messages">
            <div className="card">💬 Messages</div>
          </Link>

        </div>

      </div>
    </AppShell>
  );
}