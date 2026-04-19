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

          {/* PERFORMANCE */}
          <Card 
            href="/dashboard" 
            title="⭐ Performance" 
            desc="View performance and scores" 
          />

          {/* EARNINGS */}
          <Card 
            href="/payout" 
            title="💰 Earnings" 
            desc="Service charge and payouts" 
          />

          {/* ATTENDANCE */}
          <Card 
            href="/staff" 
            title="⏱ Attendance" 
            desc="Clock in and track time" 
          />

          {/* AI INVOICE */}
          <Card 
            href="/accounting" 
            title="🤖 AI Invoice" 
            desc="Upload and scan invoices" 
          />

          {/* GOOGLE REVIEWS */}
          <Card 
            href="/dashboard" 
            title="⭐📍 Google Reviews" 
            desc="Monitor customer feedback" 
          />

          {/* MESSAGES */}
          <Card 
            href="/dashboard" 
            title="💬 Messages" 
            desc="Internal communication" 
          />

        </div>

      </div>
    </AppShell>
  );
}