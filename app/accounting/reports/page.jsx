"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";
import { getHistoryDays } from "../../../lib/storage/localStorage";
import { calculateAccountingOverview } from "../../../lib/accounting/calcOverview";

export default function ReportsPage() {
  const [history, setHistory] = useState([]);
  const [report, setReport] = useState(null);

  useEffect(() => {
    const data = getHistoryDays() || [];
    setHistory(data);

    if (data.length) {
      const result = calculateAccountingOverview(data);
      setReport(result);
    }
  }, []);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Reports</h1>

        {report && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

            <Card title="Total Revenue" value={report.revenue} />
            <Card title="Total Service" value={report.service} />
            <Card title="Total Staff Cost" value={report.payouts} />
            <Card title="Total Expenses" value={report.expenses} />
            <Card title="Net Profit" value={report.profit} />
            <Card title="Days" value={report.days} />

          </div>
        )}

        {!report && (
          <div className="text-white/40">No report data</div>
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
        {typeof value === "number"
          ? "THB " + value.toLocaleString()
          : value}
      </p>
    </div>
  );
}