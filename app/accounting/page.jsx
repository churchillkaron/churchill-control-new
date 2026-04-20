"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function AccountingPage() {
  const [history, setHistory] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("overview");

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

  const latestDay = history[history.length - 1] || {};

  const approvedExpenses = invoices.filter(
    (i) => i.status === "approved"
  );

  const totalRevenue = latestDay?.revenue || 0;
  const totalExpenses = approvedExpenses.reduce(
    (sum, e) => sum + (e.amount || 0),
    0
  );

  const netProfit = totalRevenue - totalExpenses;

  return (
    <AppShell>
      <div className="min-h-screen text-white p-6 max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold">Accounting</h1>
          <p className="text-gray-400 text-sm">
            Financial control center
          </p>
        </div>

        {/* NAV */}
        <div className="flex gap-3 mb-8 overflow-x-auto">
          {[
            "overview",
            "revenue",
            "expenses",
            "payroll",
            "payout",
            "cashflow",
            "reports",
            "invoices",
            "ai-invoices",
          ].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-sm whitespace-nowrap ${
                activeTab === tab
                  ? "bg-orange-500 text-black"
                  : "bg-white/10 text-gray-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        {loading ? (
          <div>Loading...</div>
        ) : (
          <>
            {activeTab === "overview" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                <div className="bg-white/5 p-6 rounded-2xl">
                  <p className="text-gray-400 text-sm">Revenue</p>
                  <h2 className="text-2xl mt-2">
                    {totalRevenue.toLocaleString()} THB
                  </h2>
                </div>

                <div className="bg-white/5 p-6 rounded-2xl">
                  <p className="text-gray-400 text-sm">Expenses</p>
                  <h2 className="text-2xl mt-2">
                    {totalExpenses.toLocaleString()} THB
                  </h2>
                </div>

                <div className="bg-white/5 p-6 rounded-2xl">
                  <p className="text-gray-400 text-sm">Net</p>
                  <h2
                    className={`text-2xl mt-2 ${
                      netProfit >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {netProfit.toLocaleString()} THB
                  </h2>
                </div>

              </div>
            )}

            {activeTab === "expenses" && (
              <div className="bg-white/5 p-6 rounded-2xl">
                <h2 className="text-xl mb-4">Approved Expenses</h2>

                {approvedExpenses.length === 0 ? (
                  <p className="text-gray-400">No expenses</p>
                ) : (
                  <div className="space-y-2">
                    {approvedExpenses.map((e, i) => (
                      <div
                        key={i}
                        className="flex justify-between border-b border-white/10 pb-2"
                      >
                        <span>{e.category}</span>
                        <span>{e.amount} THB</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "revenue" && (
              <div className="bg-white/5 p-6 rounded-2xl">
                <h2 className="text-xl mb-4">Latest Revenue</h2>
                <p className="text-2xl">
                  {totalRevenue.toLocaleString()} THB
                </p>
              </div>
            )}

            {activeTab === "payroll" && (
              <div className="bg-white/5 p-6 rounded-2xl">
                Payroll module coming
              </div>
            )}

            {activeTab === "payout" && (
              <div className="bg-white/5 p-6 rounded-2xl">
                Payout control coming
              </div>
            )}

            {activeTab === "cashflow" && (
              <div className="bg-white/5 p-6 rounded-2xl">
                Cashflow tracking coming
              </div>
            )}

            {activeTab === "reports" && (
              <div className="bg-white/5 p-6 rounded-2xl">
                Reports coming
              </div>
            )}

            {activeTab === "invoices" && (
              <div className="bg-white/5 p-6 rounded-2xl">
                Invoice system coming
              </div>
            )}

            {activeTab === "ai-invoices" && (
              <div className="bg-white/5 p-6 rounded-2xl">
                AI invoice system coming
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}