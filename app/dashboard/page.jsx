"use client";

import Link from "next/link";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const items = [
    { name: "POS", href: "/pos" },
    { name: "Kitchen", href: "/kitchen" },
    { name: "Tables", href: "/tables" },
    { name: "Control", href: "/control-final" },
    { name: "Attendance", href: "/attendance" },
    { name: "History", href: "/history" },
    { name: "Accounting", href: "/accounting" },
    { name: "Payout", href: "/payout" },

    // 🔥 NEW AI BUTTON
    { name: "AI Owner", href: "/ai" },
  ];

  return (
    <AppShell showNav={false}>
      <div className="space-y-10 text-white">

        <h1 className="text-2xl">Dashboard</h1>

        <div className="grid md:grid-cols-2 gap-6">
          {items.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="p-6 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition text-center"
            >
              {item.name}
            </Link>
          ))}
        </div>

      </div>
    </AppShell>
  );
}