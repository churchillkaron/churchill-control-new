"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";
import { calculateOverview } from "../../lib/accounting/calcOverview";

export default function AccountingPage() {
  const [history, setHistory] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/history").then((res) => res.json()),
      fetch("/api/invoices").then((res) => res.json()),
    ])
      .then(([historyData, invoiceData]) => {
        setHistory(historyData || []);
        setInvoices(invoiceData || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const latestDay = history[history.length - 1];

  const approvedExpenses = invoices
    .filter((i) => i.status === "approved")
    .map((i) => ({
      category: i.category,
      amount: i.amount,
    }));

  const overview = calculateOverview({
    revenue: latestDay?.revenue || 0,
    expenses: approvedExpenses,
    payroll: 0,
  });

  return (
    <AppShell>
      <div className="text-white">Accounting OK</div>
    </AppShell>
  );
}