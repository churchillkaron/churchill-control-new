"use client";

import Link from "next/link";
import AppShell from "../AppShell";

export default function StaffPage() {
  const items = [
    {
      title: "Performance",
      desc: "Personal performance and score",
      href: "/staff/performance",
    },
    {
      title: "Earnings",
      desc: "Your earnings and service charge",
      href: "/staff/earnings",
    },
    {
      title: "Attendance",
      desc: "Clock in and track attendance",
      href: "/attendance",
    },
    {
      title: "AI Invoice",
      desc: "Upload invoice to send to accounting",
      href: "/accounting/ai-invoices",
    },
    {
      title: "Google Reviews",
      desc: "View customer reviews",
      href: "/staff/reviews",
    },
    {
      title: "Messages",
      desc: "Team communication",
      href: "/staff/messages",
    },
  ];

  return (
    <AppShell>
      <div className="min-h-screen text-white p-6 max-w-6xl mx-auto space-y-10">

        {/* HEADER */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">Staff Portal</h1>

          <Link
            href="/dashboard"
            className="text-sm text-white/60 hover:text-white"
          >
            ← Dashboard
          </Link>
        </div>

        {/* GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {items.map((item, i) => (
            <Link
              key={i}
              href={item.href}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition"
            >
              <div className="text-lg font-medium">{item.title}</div>
              <div className="text-sm text-white/50 mt-1">
                {item.desc}
              </div>
            </Link>
          ))}

        </div>

      </div>
    </AppShell>
  );
}