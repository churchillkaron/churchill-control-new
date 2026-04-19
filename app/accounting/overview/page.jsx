"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function AccountingOverview() {
  const [feed, setFeed] = useState([]);

  useEffect(() => {
    const stored = localStorage.getItem("accounting_feed");
    if (stored) setFeed(JSON.parse(stored));
  }, []);

  const summary = feed.reduce(
    (acc, item) => {
      acc.total += item.amount;

      if (item.account_type === "COGS") acc.cogs += item.amount;
      if (item.account_type === "Operating Expense") acc.opex += item.amount;
      if (item.account_type === "Owner / Non-Operating")
        acc.owner += item.amount;

      return acc;
    },
    { total: 0, cogs: 0, opex: 0, owner: 0 }
  );

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Accounting Overview</h1>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
          <div>Total: THB {summary.total.toLocaleString()}</div>
          <div>COGS: THB {summary.cogs.toLocaleString()}</div>
          <div>OPEX: THB {summary.opex.toLocaleString()}</div>
          <div>Owner: THB {summary.owner.toLocaleString()}</div>
        </div>

      </div>
    </AppShell>
  );
}