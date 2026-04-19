"use client";

import { useEffect, useState } from "react";
import AppShell from "../../../AppShell"; // ✅ FIX
import { getHistoryDays } from "../../../lib/storage/localStorage"; // ✅ FIX
import { calculateAccountingOverview } from "../../../lib/accounting/calcOverview"; // ✅ FIX

export default function AccountingOverviewPage() {
  const [history, setHistory] = useState([]);
  const [totals, setTotals] = useState(null);

  useEffect(() => {
    const data = getHistoryDays() || [];
    setHistory(data);
  }, []);

  useEffect(() => {
    if (!history.length) return;
    const result = calculateAccountingOverview(history);
    setTotals(result);
  }, [history]);

  return (
    <AppShell>
      <div className="p-6 text-white space-y-6">

        <h1 className="text-3xl">Accounting Overview</h1>

        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

            <Card title="Revenue" value={totals.revenue} />
            <Card title="Service Charge" value={totals.service} />
            <Card title="Staff Cost" value={totals.payouts} />
            <Card title="Expenses" value={totals.expenses} />
            <Card title="Net Profit" value={totals.profit} />
            <Card title="Days" value={totals.days} />

          </div>
        )}

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