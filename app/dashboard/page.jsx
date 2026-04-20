"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function DashboardPage() {
  const [decisions, setDecisions] = useState([]);
  const [aiState, setAiState] = useState({
    promo: false,
    cost: false,
    kitchen: false,
    staff: false,
  });

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

      setAiState({
        promo: localStorage.getItem("ai_promo_active") === "true",
        cost: localStorage.getItem("ai_reduce_cost_mode") === "true",
        kitchen: localStorage.getItem("ai_kitchen_alert") === "true",
        staff: localStorage.getItem("ai_staff_alert") === "true",
      });
    };

    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppShell showNav={false}>
      <div className="space-y-10 text-white">

        {/* 🔥 AI STATE PANEL */}
        <div className="space-y-4">
          <h2 className="text-lg">AI System State</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

            <div className={`p-4 rounded-xl border ${
              aiState.promo ? "border-green-500 bg-green-500/10" : "border-white/10 bg-white/5"
            }`}>
              Promotion
              <div className="text-xs opacity-60">
                {aiState.promo ? "ACTIVE" : "OFF"}
              </div>
            </div>

            <div className={`p-4 rounded-xl border ${
              aiState.cost ? "border-yellow-500 bg-yellow-500/10" : "border-white/10 bg-white/5"
            }`}>
              Cost Control
              <div className="text-xs opacity-60">
                {aiState.cost ? "ACTIVE" : "OFF"}
              </div>
            </div>

            <div className={`p-4 rounded-xl border ${
              aiState.kitchen ? "border-red-500 bg-red-500/10" : "border-white/10 bg-white/5"
            }`}>
              Kitchen Alert
              <div className="text-xs opacity-60">
                {aiState.kitchen ? "ACTIVE" : "OFF"}
              </div>
            </div>

            <div className={`p-4 rounded-xl border ${
              aiState.staff ? "border-purple-500 bg-purple-500/10" : "border-white/10 bg-white/5"
            }`}>
              Staff Alert
              <div className="text-xs opacity-60">
                {aiState.staff ? "ACTIVE" : "OFF"}
              </div>
            </div>

          </div>
        </div>

        {/* 🔥 AI DECISIONS */}
        <div className="space-y-4">
          <h2 className="text-lg">AI Decisions</h2>

          {decisions.length === 0 && (
            <div className="text-white/40">No decisions yet</div>
          )}

          {decisions.map((d) => (
            <div
              key={d.id}
              className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30"
            >
              <div className="text-xs opacity-50 mb-1">
                {d.type?.toUpperCase() || "AI"}
              </div>

              <div>{d.action}</div>
            </div>
          ))}
        </div>

        {/* 🔥 NAV GRID */}
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