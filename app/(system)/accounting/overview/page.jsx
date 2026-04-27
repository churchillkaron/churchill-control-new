"use client";

import { useEffect, useState } from "react";
import AppShell from '@/app/AppShell'

export default function AccountingOverview() {
  const [feed, setFeed] = useState([]);
  const [revenue, setRevenue] = useState([]);

  useEffect(() => {
    const storedFeed = JSON.parse(localStorage.getItem("accounting_feed") || "[]");
    const storedRevenue = JSON.parse(localStorage.getItem("revenue") || "[]");

    setFeed(storedFeed);
    setRevenue(storedRevenue);
  }, []);

  const totalExpenses = feed.reduce((sum, item) => sum + item.amount, 0);
  const totalRevenue = revenue.reduce((sum, r) => sum + r.amount, 0);

  const profit = totalRevenue - totalExpenses;

  // 🔥 SERVICE LEVEL LOGIC
  let serviceLevel = 5;
  if (profit > 50000) serviceLevel = 7;
  else if (profit > 20000) serviceLevel = 6;

  // 🔥 SERVICE CHARGE POOL
  const servicePool = (totalRevenue * serviceLevel) / 100;

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
            Expenses: THB {totalExpenses.toLocaleString()}
          </div>

          <hr className="border-white/10 my-3" />

          <div className={`text-xl ${profit >= 0 ? "text-green-400" : "text-red-400"}`}>
            Net Profit: THB {profit.toLocaleString()}
          </div>

        </div>

        {/* SERVICE LEVEL */}
        <div className="bg-[#ff7a00]/10 border border-[#ff7a00]/30 rounded-2xl p-6">
          <div className="text-sm text-white/60">Service Charge Level</div>
          <div className="text-3xl text-[#ff7a00]">{serviceLevel}%</div>
        </div>

        {/* 🔥 SERVICE POOL */}
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6">

          <div className="text-sm text-white/60">
            Service Charge Pool (Available for Staff)
          </div>

          <div className="text-3xl text-green-400">
            THB {servicePool.toLocaleString()}
          </div>

        </div>

      </div>
    </AppShell>
  );
}