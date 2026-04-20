"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "../AppShell";

function parseAI(text) {
  const lines = text.split("\n").filter(Boolean);

  return lines.map((line) => {
    const lower = line.toLowerCase();

    let severity = "INFO";
    if (lower.includes("critical") || lower.includes("overload")) {
      severity = "CRITICAL";
    } else if (lower.includes("low") || lower.includes("warning") || lower.includes("drop")) {
      severity = "WARNING";
    }

    return {
      action: line,
      reason: line,   // simple for now (same line)
      impact: line,   // upgrade later
      severity,
    };
  });
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
      setAiLogs(logs.slice(-3).reverse());
    };

    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppShell showNav={false}>
      <div className="space-y-10 text-white">

        {/* 🔥 AI OWNER PANEL */}
        <div className="space-y-4">
          <h2 className="text-lg">AI Owner Decisions</h2>

          {aiLogs.length === 0 && (
            <div className="text-white/40">No AI activity yet</div>
          )}

          {aiLogs.map((log) => {
            const decisions = parseAI(log.result);

            return decisions.map((d, i) => (
              <div
                key={log.id + "_" + i}
                className={`p-4 rounded-xl border ${getStyle(d.severity)}`}
              >
                <div className="flex justify-between text-xs mb-2 opacity-70">
                  <span>{d.severity}</span>
                  <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                </div>

                <div className="text-sm space-y-2">

                  <div>
                    <span className="opacity-50">Action:</span><br />
                    {d.action}
                  </div>

                  <div>
                    <span className="opacity-50">Reason:</span><br />
                    {d.reason}
                  </div>

                  <div>
                    <span className="opacity-50">Impact:</span><br />
                    {d.impact}
                  </div>

                </div>
              </div>
            ));
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