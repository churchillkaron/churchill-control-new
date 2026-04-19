"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("expenses") || "[]");
    setExpenses(data);
  }, []);

  const addExpense = () => {
    if (!amount) return;

    const newItem = {
      id: Date.now(),
      amount: Number(amount),
      note,
      date: new Date().toLocaleDateString("en-GB"),
    };

    const updated = [newItem, ...expenses];

    localStorage.setItem("expenses", JSON.stringify(updated));
    setExpenses(updated);

    setAmount("");
    setNote("");
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Expenses</h1>

        {/* ADD */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (THB)"
            className="w-full px-4 py-2 rounded bg-black/40 text-white"
          />

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note"
            className="w-full px-4 py-2 rounded bg-black/40 text-white"
          />

          <button
            onClick={addExpense}
            className="bg-[#ff7a00] px-4 py-2 rounded"
          >
            Add Expense
          </button>

        </div>

        {/* LIST */}
        <div className="space-y-3">

          {expenses.map((e) => (
            <div
              key={e.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between"
            >
              <div>
                <div>{e.note || "Expense"}</div>
                <div className="text-xs text-white/40">{e.date}</div>
              </div>

              <div className="text-red-400">
                THB {e.amount.toLocaleString()}
              </div>
            </div>
          ))}

          {expenses.length === 0 && (
            <div className="text-white/40">No expenses yet</div>
          )}

        </div>

      </div>
    </AppShell>
  );
}