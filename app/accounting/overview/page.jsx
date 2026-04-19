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

      // Department
      acc.departments[item.department] =
        (acc.departments[item.department] || 0) + item.amount;

      // 🔥 NEW: Natural account (cost drivers)
      acc.natural[item.natural_account] =
        (acc.natural[item.natural_account] || 0) + item.amount;

      return acc;
    },
    {
      total: 0,
      cogs: 0,
      opex: 0,
      owner: 0,
      departments: {},
      natural: {},
    }
  );

  const totalRevenue = revenue.reduce((sum, r) => sum + r.amount, 0);
  const profit = totalRevenue - expenseSummary.total;

  // 🔥 Top 5 cost drivers
  const topCosts = Object.entries(expenseSummary.natural)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

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

        {/* DEPARTMENTS */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-2">
          <h2 className="text-xl">Department Spend</h2>

          {Object.entries(expenseSummary.departments).map(([dept, amount]) => (
            <div key={dept} className="flex justify-between">
              <span>{dept}</span>
              <span>THB {amount.toLocaleString()}</span>
            </div>
          ))}

          {Object.keys(expenseSummary.departments).length === 0 && (
            <div className="text-white/40">No data yet</div>
          )}
        </div>

        {/* 🔥 TOP COST DRIVERS */}
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