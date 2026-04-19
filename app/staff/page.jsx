"use client";

import AppShell from "../AppShell";
import Link from "next/link";

export default function StaffPortal() {
  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Staff Portal</h1>

        <div className="grid md:grid-cols-2 gap-6">

          {/* PERFORMANCE */}
          <Link href="/history">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 transition cursor-pointer">
              <div className="text-lg flex items-center gap-2">
                ⭐ Performance
              </div>
              <div className="text-white/50 text-sm">
                Your score and daily performance
              </div>
            </div>
          </Link>

          {/* EARNINGS */}
          <Link href="/payout">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 transition cursor-pointer">
              <div className="text-lg flex items-center gap-2">
                💰 Earnings
              </div>
              <div className="text-white/50 text-sm">
                Salary and service charge
              </div>
            </div>
          </Link>

          {/* ATTENDANCE */}
          <Link href="/staff">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 transition cursor-pointer">
              <div className="text-lg flex items-center gap-2">
                ⏱ Attendance
              </div>
              <div className="text-white/50 text-sm">
                Check-in and lateness
              </div>
            </div>
          </Link>

          {/* AI INVOICE */}
          <Link href="/staff/invoice">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 transition cursor-pointer">
              <div className="text-lg flex items-center gap-2">
                🤖 AI Invoice
              </div>
              <div className="text-white/50 text-sm">
                Upload invoices for accounting
              </div>
            </div>
          </Link>

          {/* GOOGLE REVIEWS */}
          <Link href="/staff/reviews">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 transition cursor-pointer">
              <div className="text-lg flex items-center gap-2">
                ⭐📍 Google Reviews
              </div>
              <div className="text-white/50 text-sm">
                Upload customer reviews
              </div>
            </div>
          </Link>

          {/* MESSAGES */}
          <Link href="/staff/messages">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 transition cursor-pointer">
              <div className="text-lg flex items-center gap-2">
                💬 Messages
              </div>
              <div className="text-white/50 text-sm">
                Contact management
              </div>
            </div>
          </Link>

        </div>

      </div>
    </AppShell>
  );
}