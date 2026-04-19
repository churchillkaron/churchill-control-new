"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import AppShell from "../AppShell"; // ✅ CORRECT
import { calculateAccountingOverview } from "../../lib/accounting/calcOverview"; // ✅ CORRECT

export default function DashboardPage() {
  const [history, setHistory] = useState([]);
  const [totals, setTotals] = useState(null);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("history") || "[]");
    setHistory(data);

    if (data.length) {
      const overview = calculateAccountingOverview(data);
      setTotals(overview);
    }
  }, []);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Dashboard</h1>

        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card title="Revenue" value={totals.revenue} />
            <Card title="Profit" value={totals.profit} />
            <Card title="Staff Cost" value={totals.payouts} />
            <Card title="Days" value={totals.days} />
          </div>
        )}

      </div>
    </AppShell>
  );
}

function Card({ title, value }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <p className="text-xs text-white/40">{title}</p>
      <p className="text-xl mt-2">
        THB {(value || 0).toLocaleString()}
      </p>
    </div>
  );
}