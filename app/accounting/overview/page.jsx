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

      if (item.account_type === "COGS") acc.cogs += item.amount;
      if (item.account_type === "Operating Expense") acc.opex += item.amount;
      if (item.account_type === "Owner / Non-Operating") acc.owner += item.amount;

      acc.departments[item.department] =
        (acc.departments[item.department] || 0) + item.amount;

      acc.natural[item.natural_account] =
        (acc.natural[item.natural_account] || 0) + item.amount;

      // 🔥 NEW: DAILY TRACK
      const day = item.date || "Unknown";
      acc.daily[day] = (acc.daily[day] || 0) + item.amount;

      return acc;
    },
    {
      total: 0,
      cogs: 0,
      opex: 0,
      owner: 0,
      departments: {},
      natural: {},
      daily: {},
    }
  );

  const totalRevenue = revenue.reduce((sum, r) => sum + r.amount, 0);
  const profit = totalRevenue - expenseSummary.total;

  const topCosts = Object.entries(expenseSummary.natural)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // 🔥 Sort daily newest first
  const daily = Object.entries(expenseSummary.daily).sort(
    (a, b) => new Date(b[0]) - new Date(a[0])
  );

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Accounting Overview</h1>

        {/* MAIN */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
          <div className="text-green-400">
            Revenue: THB {totalRevenue.toLocaleString()}
          </div>

          <div className="text-red-400">
            Expenses: THB {expenseSummary.total.toLocaleString()}
          </div>

          <div>COGS: THB {expenseSummary.cogs.toLocaleString()}</div>
          <div>OPEX: THB {expenseSummary.opex.toLocaleString()}</div>
          <div>Owner: THB {expenseSummary.owner.toLocaleString()}</div>

          <hr className="border-white/10 my-3" />

          <div className={`text-xl ${profit >= 0 ? "text-green-400" : "text-red-400"}`}>
            Net Profit: THB {profit.toLocaleString()}
          </div>
        </div>

        {/* DAILY TRACKING */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-2">
          <h2 className="text-xl">Daily Expenses</h2>

          {daily.map(([day, amount]) => (
            <div key={day} className="flex justify-between">
              <span>{day}</span>
              <span>THB {amount.toLocaleString()}</span>
            </div>
          ))}

          {daily.length === 0 && (
            <div className="text-white/40">No data yet</div>
          )}
        </div>

        {/* TOP COSTS */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-2">
          <h2 className="text-xl">Top Cost Drivers</h2>

          {topCosts.map(([name, amount]) => (
            <div key={name} className="flex justify-between">
              <span>{name}</span>
              <span>THB {amount.toLocaleString()}</span>
            </div>
          ))}

          {topCosts.length === 0 && (
            <div className="text-white/40">No data yet</div>
          )}
        </div>

      </div>
    </AppShell>
  );
}