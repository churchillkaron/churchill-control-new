"use client";

import AppShell from "../AppShell";

export default function StaffPortal() {
  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Staff Portal</h1>

        <div className="grid md:grid-cols-2 gap-6">

          {/* PERFORMANCE */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 transition">
            <div className="text-lg flex items-center gap-2">
              ⭐ Performance
            </div>
            <div className="text-white/50 text-sm">
              Your score, level, and ranking today
            </div>
          </div>

          {/* EARNINGS */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 transition">
            <div className="text-lg flex items-center gap-2">
              💰 Earnings
            </div>
            <div className="text-white/50 text-sm">
              Salary, service charge, and payouts
            </div>
          </div>

          {/* ATTENDANCE */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 transition">
            <div className="text-lg flex items-center gap-2">
              ⏱ Attendance
            </div>
            <div className="text-white/50 text-sm">
              Check-in status and lateness tracking
            </div>
          </div>

          {/* AI INVOICE */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 transition">
            <div className="text-lg flex items-center gap-2">
              🤖 AI Invoice
            </div>
            <div className="text-white/50 text-sm">
              Upload receipts and invoices
            </div>
          </div>

          {/* GOOGLE REVIEWS */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 transition">
            <div className="text-lg flex items-center gap-2">
              ⭐📍 Google Reviews
            </div>
            <div className="text-white/50 text-sm">
              Upload customer reviews and feedback
            </div>
          </div>

          {/* MESSAGES */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 transition">
            <div className="text-lg flex items-center gap-2">
              💬 Messages
            </div>
            <div className="text-white/50 text-sm">
              Communication with management
            </div>
          </div>

        </div>

      </div>
    </AppShell>
  );
}