"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "../AppShell";

function getSeverity(text) {
  const t = text.toLowerCase();

  if (t.includes("critical") || t.includes("overload") || t.includes("danger")) {
    return "CRITICAL";
  }

  if (t.includes("warning") || t.includes("low") || t.includes("drop")) {
    return "WARNING";
  }

  return "INFO";
}

function getStyle(severity) {
  if (severity === "CRITICAL") {
    return "border-red-500 bg-red-500/10 text-red-300";
  }

  if (severity === "WARNING") {
    return "border-yellow-500 bg-yellow-500/10 text-yellow-300";
  }

  return "border-white/10 bg-white/5 text-white";
}

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
      setAiLogs(logs.slice(-5).reverse());
    };

    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppShell showNav={false}>
      <div className="space-y-10 text-white">

        {/* 🔥 AI PANEL */}
        <div className="space-y-4">
          <h2 className="text-lg">AI Control Signals</h2>

          {aiLogs.length === 0 && (
            <div className="text-white/40">No AI activity yet</div>
          )}

          {aiLogs.map((log) => {
            const severity = getSeverity(log.result);
            const style = getStyle(severity);

            return (
              <div
                key={log.id}
                className={`p-4 rounded-xl border ${style}`}
              >
                <div className="flex justify-between text-xs mb-2 opacity-70">
                  <span>{severity}</span>
                  <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                </div>

                <div className="text-sm whitespace-pre-line">
                  {log.result}
                </div>
              </div>
            );
          })}
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