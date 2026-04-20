"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [aiLogs, setAiLogs] = useState([]);

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
      const logs = JSON.parse(localStorage.getItem("ai_logs") || "[]");
      setAiLogs(logs.slice(-3).reverse()); // last 3 only
    };

    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppShell showNav={false}>
      <div className="space-y-10 text-white">

        {/* 🔥 AI PANEL */}
        <div className="bg-white/5 p-6 rounded-xl border border-white/10">
          <h2 className="text-lg mb-4">AI Insights</h2>

          {aiLogs.length === 0 && (
            <div className="text-white/40">No AI activity yet</div>
          )}

          {aiLogs.map((log) => (
            <div
              key={log.id}
              className="mb-3 p-3 bg-white/5 rounded border border-white/10"
            >
              <div className="text-xs text-white/40 mb-1">
                {new Date(log.created_at).toLocaleTimeString()}
              </div>
              <div className="text-sm whitespace-pre-line">
                {log.result}
              </div>
            </div>
          ))}
        </div>

        {/* 🔥 NAV GRID */}
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