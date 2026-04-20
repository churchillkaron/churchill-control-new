"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";
import { calculateOverview } from "@/lib/accounting/calcOverview";

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

  // 🔥 GET LATEST DAY (CORE)
  const latestDay = history[history.length - 1];

  // 🔥 FILTER APPROVED EXPENSES ONLY
  const approvedExpenses = invoices
    .filter((i) => i.status === "approved")
    .map((i) => ({
      category: i.category,
      amount: i.amount,
    }));

  // 🔥 CALC ENGINE
  const overview = calculateOverview({
    revenue: latestDay?.revenue || 0,
    expenses: approvedExpenses,
    payroll: 0, // add later from payroll system
  });

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Accounting Overview</h1>

        {loading && <div className="text-white/50">Loading...</div>}

        {!loading && (
          <>
            {/* REVENUE */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="text-sm text-white/50">Revenue</div>
              <div className="text-3xl mt-2">
                {overview.revenue} THB
              </div>
            </div>

            {/* KPI */}
            <div className="grid md:grid-cols-3 gap-4">

              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-sm text-white/50">COGS</div>
                <div className="text-xl mt-1">
                  {overview.cogs} THB
                </div>
                <div className="text-xs text-white/40">
                  {overview.costPercent}% of revenue
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-sm text-white/50">Operating Expense</div>
                <div className="text-xl mt-1">
                  {overview.operatingExpense} THB
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-sm text-white/50">Profit</div>
                <div className="text-xl mt-1">
                  {overview.profit} THB
                </div>
                <div className="text-xs text-white/40">
                  {overview.profitPercent}%
                </div>
              </div>

            </div>

            {/* BREAKDOWN */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <div className="text-lg">Expense Breakdown</div>

              {Object.entries(overview.breakdown).map(([type, departments]) => (
                <div key={type}>
                  <div className="text-sm text-white/50 mt-4">{type}</div>

                  {Object.entries(departments).map(([dept, accounts]) => (
                    <div key={dept} className="ml-4 mt-2">
                      <div className="text-sm">{dept}</div>

                      {Object.entries(accounts).map(([acc, amount]) => (
                        <div
                          key={acc}
                          className="flex justify-between text-xs text-white/60 ml-4"
                        >
                          <span>{acc}</span>
                          <span>{amount} THB</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}

              {approvedExpenses.length === 0 && (
                <div className="text-white/40 text-sm">
                  No approved expenses yet
                </div>
              )}
            </div>

            {/* APPROVAL QUEUE */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <div className="text-lg">Pending Approvals</div>

              {invoices
                .filter((i) => i.status === "pending_approval")
                .map((inv) => (
                  <div
                    key={inv.id}
                    className="flex justify-between border-b border-white/10 pb-2"
                  >
                    <div>
                      <div>{inv.vendor}</div>
                      <div className="text-xs text-white/50">
                        {inv.category} ({inv.department})
                      </div>
                    </div>
                    <div>{inv.amount} THB</div>
                  </div>
                ))}

              {invoices.filter((i) => i.status === "pending_approval").length === 0 && (
                <div className="text-white/40 text-sm">
                  No pending invoices
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}