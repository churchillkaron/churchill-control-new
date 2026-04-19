"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function AccountingOverview() {
  const [feed, setFeed] = useState([]);
  const [revenue, setRevenue] = useState([]);

  useEffect(() => {
    const storedFeed = JSON.parse(localStorage.getItem("accounting_feed") || "[]");
    const storedRevenue = JSON.parse(localStorage.getItem("revenue") || "[]");

    setFeed(storedFeed);
    setRevenue(storedRevenue);
  }, []);

  const expenseSummary = feed.reduce(
    (acc, item) => {
      acc.total += item.amount;

      const day = item.date || "Unknown";
      const month = day ? day.slice(3, 10) : "Unknown";

      acc.monthly[month] = (acc.monthly[month] || 0) + item.amount;

      return acc;
    },
    {
      total: 0,
      monthly: {},
    }
  );

  const totalRevenue = revenue.reduce((sum, r) => sum + r.amount, 0);
  const profit = totalRevenue - expenseSummary.total;

  // 🔥 CURRENT MONTH (simple latest key)
  const months = Object.keys(expenseSummary.monthly).sort().reverse();
  const currentMonth = months[0];
  const currentExpenses = expenseSummary.monthly[currentMonth] || 0;

  // 🔥 PERFORMANCE RULE
  let serviceLevel = 5;

  if (profit > 50000) serviceLevel = 7;
  else if (profit > 20000) serviceLevel = 6;

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Accounting Overview</h1>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">

          <div className="text-green-400">
            Revenue: THB {totalRevenue.toLocaleString()}
          </div>

          <div className="text-red-400">
            Expenses: THB {expenseSummary.total.toLocaleString()}
          </div>

          <hr className="border-white/10 my-3" />

          <div className={`text-xl ${profit >= 0 ? "text-green-400" : "text-red-400"}`}>
            Net Profit: THB {profit.toLocaleString()}
          </div>

        </div>

        {/* 🔥 SERVICE CHARGE */}
        <div className="bg-[#ff7a00]/10 border border-[#ff7a00]/30 rounded-2xl p-6 space-y-2">

          <h2 className="text-xl">Service Charge Level</h2>

          <div className="text-3xl text-[#ff7a00]">
            {serviceLevel}%
          </div>

          <div className="text-sm text-white/60">
            Based on monthly performance
          </div>

        </div>

      </div>
    </AppShell>
  );
}