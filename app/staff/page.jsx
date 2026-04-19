"use client";

import Link from "next/link";
import AppShell from "../AppShell";

export default function StaffPortal() {
  const Card = ({ href, title, desc }) => (
    <Link
      href={href}
      className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
    >
      <div className="text-xl text-white">{title}</div>
      <div className="text-white/50 text-sm mt-2">{desc}</div>
    </Link>
  );

  return (
    <AppShell>
      <div className="space-y-10 text-white">
        <h1 className="text-3xl">Staff Portal</h1>

        <div className="grid md:grid-cols-2 gap-6">
          <Card
            href="/staff/performance"
            title="⭐ Performance"
            desc="Personal performance and score"
          />

          <Card
            href="/staff/earnings"
            title="💰 Earnings"
            desc="Your earnings and service charge"
          />

          <Card
            href="/staff/attendance"
            title="⏱ Attendance"
            desc="Clock in and track attendance"
          />

          <Card
            href="/staff/invoice"
            title="🤖 AI Invoice"
            desc="Upload invoice to send to accounting"
          />

          <Card
            href="/staff/reviews"
            title="⭐📍 Google Reviews"
            desc="View customer reviews"
          />

          <Card
            href="/staff/messages"
            title="💬 Messages"
            desc="Team communication"
          />
        </div>
      </div>
    </AppShell>
  );
}