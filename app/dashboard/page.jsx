"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [decisions, setDecisions] = useState([]);

  const items = [
    { name: "POS", href: "/pos" },
    { name: "Kitchen", href: "/kitchen" },
    { name: "Tables", href: "/tables" },
    { name: "Control", href: "/control-final" },
    { name: "Attendance", href: "/attendance" },
    { name: "History", href: "/history" },
    { name: "Accounting", href: "/accounting" },
    { name: "Payout", href: "/payout" },
    { name: "AI Owner", href: "/ai" },
  ];

  useEffect(() => {
    const load = () => {
      const data = JSON.parse(localStorage.getItem("ai_decisions") || "[]");
      setDecisions(data.slice(-5).reverse());
    };

    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppShell showNav={false}>
      <div className="space-y-10 text-white">

        {/* 🔥 REAL DECISIONS */}
        <div className="space-y-4">
          <h2 className="text-lg">AI Decisions (Active)</h2>

          {decisions.length === 0 && (
            <div className="text-white/40">No decisions yet</div>
          )}

          {decisions.map((d) => (
            <div
              key={d.id}
              className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30"
            >
              <div className="text-xs opacity-50 mb-1">
                {d.type.toUpperCase()}
              </div>

              <div>{d.action}</div>
            </div>
          ))}
        </div>

        {/* NAV */}
        <div className="grid md:grid-cols-2 gap-6">
          {items.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="p-6 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-center"
            >
              {item.name}
            </Link>
          ))}
        </div>

      </div>
    </AppShell>
  );
}