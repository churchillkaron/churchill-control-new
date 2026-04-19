"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";
import { getHistoryDays } from "@/lib/storage/localStorage";

export default function AccountingOverview() {
  const [days, setDays] = useState([]);

  useEffect(() => {
    const data = getHistoryDays();
    setDays(data);
  }, []);

  // 🔽 CALCULATIONS
  const totalRevenue = days.reduce((sum, d) => sum + (d.revenue || 0), 0);

  const totalServiceCharge = days.reduce(
    (sum, d) => sum + (d.serviceCharge || 0),
    0
  );

  const totalPayouts = days.reduce((sum, d) => {
    if (!d.payouts) return sum;
    return (
      sum +
      Object.values(d.payouts).reduce((a, b) => a + (b || 0), 0)
    );
  }, 0);

  const totalExpenses = days.reduce(
    (sum, d) => sum + (d.expenses || 0),
    0
  );

  const netProfit =
    totalRevenue - totalServiceCharge - totalPayouts - totalExpenses;

  return (
    <AppShell>
      <div className="space-y-10">

        <h1 className="text-4xl text-white">Accounting Overview</h1>

        {/* 🔥 MAIN KPI GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <Card title="Total Revenue" value={totalRevenue} highlight />

          <Card title="Service Charge" value={totalServiceCharge} />

          <Card title="Staff Cost" value={totalPayouts} />

          <Card title="Expenses" value={totalExpenses} />

          <Card title="Net Profit" value={netProfit} profit />

          <Card title="Days Tracked" value={days.length} />

        </div>

      </div>
    </AppShell>
  );
}

// 🔽 CARD COMPONENT (MATCHES CONTROL STYLE)
function Card({ title, value, highlight, profit }) {
  return (
    <div className={`
      p-6 rounded-2xl
      bg-black/40 backdrop-blur
      border border-white/10
      shadow-lg
    `}>
      <p className="text-sm text-gray-400">{title}</p>

      <p
        className={`
          text-2xl font-semibold mt-2
          ${highlight ? "text-orange-400" : ""}
          ${profit && value < 0 ? "text-red-400" : ""}
          ${profit && value >= 0 ? "text-green-400" : ""}
        `}
      >
        {typeof value === "number"
          ? "THB " + value.toLocaleString()
          : value}
      </p>
    </div>
  );
}