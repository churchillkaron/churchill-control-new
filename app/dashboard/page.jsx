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
    staff: "normal",
    service: 5,
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
      const decisionData = JSON.parse(localStorage.getItem("ai_decisions") || "[]");

      setDecisions(decisionData.slice(-5).reverse());

      setAiState({
        promo: localStorage.getItem("ai_promo_active") === "true",
        cost: localStorage.getItem("ai_reduce_cost_mode") === "true",
        kitchen: localStorage.getItem("ai_kitchen_alert") === "true",
        staff: localStorage.getItem("ai_staff_mode") || "normal",
        service: Number(localStorage.getItem("ai_service_level") || 5),
      });
    };

    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, []);

  const getStaffStyle = () => {
    if (aiState.staff === "bonus") return "border-green-500 bg-green-500/10";
    if (aiState.staff === "penalty") return "border-red-500 bg-red-500/10";
    return "border-white/10 bg-white/5";
  };

  return (
    <AppShell showNav={false}>
      <div className="space-y-10 text-white">

        {/* AI STATE */}
        <div className="space-y-4">
          <h2 className="text-lg">AI System State</h2>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">

            <div className={`p-4 rounded-xl border ${aiState.promo ? "border-green-500 bg-green-500/10" : "border-white/10 bg-white/5"}`}>
              Promotion
              <div className="text-xs opacity-60">{aiState.promo ? "ACTIVE" : "OFF"}</div>
            </div>

            <div className={`p-4 rounded-xl border ${aiState.cost ? "border-yellow-500 bg-yellow-500/10" : "border-white/10 bg-white/5"}`}>
              Cost Control
              <div className="text-xs opacity-60">{aiState.cost ? "ACTIVE" : "OFF"}</div>
            </div>

            <div className={`p-4 rounded-xl border ${aiState.kitchen ? "border-red-500 bg-red-500/10" : "border-white/10 bg-white/5"}`}>
              Kitchen Alert
              <div className="text-xs opacity-60">{aiState.kitchen ? "ACTIVE" : "OFF"}</div>
            </div>

            <div className={`p-4 rounded-xl border ${getStaffStyle()}`}>
              Staff Mode
              <div className="text-xs opacity-60">
                {aiState.staff.toUpperCase()}
              </div>
            </div>

            <div className="p-4 rounded-xl border border-blue-500 bg-blue-500/10">
              Service Level
              <div className="text-xs opacity-60">{aiState.service}%</div>
            </div>

          </div>
        </div>

        {/* DECISIONS */}
        <div className="space-y-4">
          <h2 className="text-lg">AI Decisions</h2>

          {decisions.map((d) => (
            <div key={d.id} className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30">
              <div>{d.action}</div>
            </div>
          ))}
        </div>

        {/* NAV */}
        <div className="grid md:grid-cols-2 gap-6">
          {items.map((item) => (
            <Link key={item.name} href={item.href} className="p-6 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-center">
              {item.name}
            </Link>
          ))}
        </div>

      </div>
    </AppShell>
  );
}