"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";
import { getHistoryDays } from "../../../lib/storage";

export default function AccountingPage() {
  const [history, setHistory] = useState([]);

  const [totals, setTotals] = useState({
    revenue: 0,
    service: 0,
    payouts: 0,
    expenses: 0,
    profit: 0,
    days: 0
  });

  useEffect(() => {
    const data = getHistoryDays() || [];
    setHistory(data);
  }, []);

  useEffect(() => {
    if (!history.length) return;

    const totalRevenue = history.reduce(
      (sum, d) => sum + (d.revenue || 0),
      0
    );

    const totalService = history.reduce(
      (sum, d) => sum + (d.serviceCharge || 0),
      0
    );

    // ✅ SAFE payouts handling (supports BOTH structures)
    const totalPayouts = history.reduce((sum, d) => {
      if (!d.payouts) return sum;

      // case 1: structured (preferred)
      if (typeof d.payouts.total === "number") {
        return sum + d.payouts.total;
      }

      // case 2: old object format
      return (
        sum +
        Object.values(d.payouts).reduce(
          (a, b) => a + (typeof b === "number" ? b : 0),
          0
        )
      );
    }, 0);

    const totalExpenses = history.reduce(
      (sum, d) => sum + (d.expenses || 0),
      0
    );

    const netProfit =
      totalRevenue - totalPayouts - totalExpenses;

    setTotals({
      revenue: totalRevenue,
      service: totalService,
      payouts: totalPayouts,
      expenses: totalExpenses,
      profit: netProfit,
      days: history.length
    });
  }, [history]);

  return (
    <AppShell>
      <div className="p-6 text-white space-y-6">

        <h1 className="text-3xl">Accounting Overview</h1>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

          <Card title="Revenue" value={totals.revenue} />
          <Card title="Service Charge" value={totals.service} />
          <Card title="Staff Cost" value={totals.payouts} />
          <Card title="Expenses" value={totals.expenses} />
          <Card title="Net Profit" value={totals.profit} />
          <Card title="Days" value={totals.days} />

        </div>

      </div>
    </AppShell>
  );
}

function Card({ title, value }) {
  return (
    <div className="bg-black/40 p-4 rounded-xl border border-white/10">
      <p className="text-gray-400 text-sm">{title}</p>
      <p className="text-xl mt-2">
        {typeof value === "number"
          ? "THB " + value.toLocaleString()
          : value}
      </p>
    </div>
  );
}