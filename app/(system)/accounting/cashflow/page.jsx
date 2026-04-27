"use client";
import something from '@/lib/storage/localStorage'
export const dynamic = "force-dynamic"; // ✅ FIX

import { useEffect, useState } from "react";
import AppShell from '@/app/AppShell'


export default function CashflowPage() {
  const [history, setHistory] = useState([]);
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    const h = getHistoryDays() || [];
    const e = JSON.parse(localStorage.getItem("expenses") || "[]");

    setHistory(h);
    setExpenses(e);
  }, []);

  const totalRevenue = history.reduce(
    (sum, d) => sum + (d.revenue || 0),
    0
  );

  const totalExpenses = expenses.reduce(
    (sum, e) => sum + (e.amount || 0),
    0
  );

  const netCash = totalRevenue - totalExpenses;

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Cash Flow</h1>

        <div className="grid grid-cols-3 gap-4">

          <Card title="Cash In" value={totalRevenue} color="green" />
          <Card title="Cash Out" value={totalExpenses} color="red" />
          <Card title="Net Cash" value={netCash} color="white" />

        </div>

        <div className="space-y-3">

          {history.map((d) => (
            <FlowRow
              key={d.id}
              label={`Revenue ${d.date}`}
              amount={d.revenue || 0}
              type="in"
            />
          ))}

          {expenses.map((e) => (
            <FlowRow
              key={e.id}
              label={e.note || "Expense"}
              amount={e.amount || 0}
              type="out"
            />
          ))}

        </div>

      </div>
    </AppShell>
  );
}

function Card({ title, value, color }) {
  const colorClass =
    color === "green"
      ? "text-green-400"
      : color === "red"
      ? "text-red-400"
      : "text-white";

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <p className="text-xs text-white/40">{title}</p>
      <p className={`text-xl mt-2 ${colorClass}`}>
        THB {(value || 0).toLocaleString()}
      </p>
    </div>
  );
}

function FlowRow({ label, amount, type }) {
  return (
    <div className="flex justify-between bg-white/5 border border-white/10 rounded-xl p-3 text-sm">
      <span>{label}</span>
      <span className={type === "in" ? "text-green-400" : "text-red-400"}>
        {type === "in" ? "+" : "-"} THB {(amount || 0).toLocaleString()}
      </span>
    </div>
  );
}