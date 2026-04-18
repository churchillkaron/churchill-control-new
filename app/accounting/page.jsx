"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function Accounting() {
  const [expenses, setExpenses] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadData();

    const handleStorageChange = () => loadData();
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const loadData = () => {
    const storedExpenses =
      JSON.parse(localStorage.getItem("expenses")) || [];
    const storedHistory =
      JSON.parse(localStorage.getItem("history")) || [];

    setExpenses(storedExpenses);
    setHistory(storedHistory);
  };

  // 🔥 TOTALS
  const totalExpenses = expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  const totalRevenue = history.reduce(
    (sum, d) => sum + Number(d.revenue || 0),
    0
  );

  const totalService = history.reduce(
    (sum, d) => sum + Number(d.serviceCharge || 0),
    0
  );

  const netProfit = totalRevenue - totalExpenses;

  return (
    <AppShell>
      <div className="space-y-12">

        {/* HEADER */}
        <div>
          <h1 className="text-3xl text-white/90">Accounting</h1>
          <p className="text-white/50 text-sm">
            Financial control and real profit tracking
          </p>
        </div>

        {/* TOTAL OVERVIEW */}
        <div className="grid md:grid-cols-4 gap-6">
          <Card label="Revenue" value={`THB ${totalRevenue}`} />
          <Card label="Expenses" value={`THB ${totalExpenses}`} />
          <Card label="Profit" value={`THB ${netProfit}`} highlight />
          <Card label="Service" value={`THB ${totalService}`} />
        </div>

        {/* DAILY PROFIT */}
        <div className="bg-white/5 p-6 rounded-2xl backdrop-blur">
          <h2 className="text-white mb-4">Daily Profit</h2>

          {history.length === 0 && (
            <p className="text-white/40">No data</p>
          )}

          {history.map((day, i) => {
            const dayExpense = expenses
              .filter((e) => e.date === day.date)
              .reduce((sum, e) => sum + Number(e.amount || 0), 0);

            const profit = day.revenue - dayExpense;

            return (
              <div
                key={i}
                className="flex justify-between py-2 border-b border-white/10"
              >
                <span>{day.date}</span>
                <span>
                  THB {profit} ({day.revenue} - {dayExpense})
                </span>
              </div>
            );
          })}
        </div>

      </div>
    </AppShell>
  );
}

/* CARD */
function Card({ label, value, highlight }) {
  return (
    <div className={`p-5 rounded-2xl bg-white/5 border border-white/10 ${highlight ? "text-orange-400" : "text-white"}`}>
      <p className="text-sm opacity-60">{label}</p>
      <p className="text-xl mt-1">{value}</p>
    </div>
  );
}