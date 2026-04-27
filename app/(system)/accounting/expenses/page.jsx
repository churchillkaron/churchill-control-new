"use client";

import { useEffect, useState } from "react";
import AppShell from "@/app/AppShell";

export default function ExpensesPage() {
  const [manualExpenses, setManualExpenses] = useState([]);
  const [invoiceFeed, setInvoiceFeed] = useState([]);

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("general");

  useEffect(() => {
    const manual = JSON.parse(localStorage.getItem("expenses") || "[]");
    const feed = JSON.parse(localStorage.getItem("accounting_feed") || "[]");

    setManualExpenses(manual);
    setInvoiceFeed(feed);
  }, []);

  const saveManual = (data) => {
    localStorage.setItem("expenses", JSON.stringify(data));
    setManualExpenses(data);
  };

  const addExpense = () => {
    if (!amount) return;

    const newItem = {
      id: Date.now(),
      amount: Number(amount),
      note,
      category,
      date: new Date().toISOString(),
      type: "manual",
    };

    const updated = [newItem, ...manualExpenses];
    saveManual(updated);

    setAmount("");
    setNote("");
    setCategory("general");
  };

  const deleteExpense = (id) => {
    const updated = manualExpenses.filter((e) => e.id !== id);
    saveManual(updated);
  };

  // merge
  const combined = [
    ...manualExpenses.map((e) => ({
      ...e,
      label: e.note || "Manual Expense",
      source: "manual",
    })),
    ...invoiceFeed.map((i, index) => ({
      id: `inv-${index}`,
      amount: i.amount,
      label: `${i.vendor || "Vendor"} (${i.natural_account || "N/A"})`,
      date: i.date || "",
      category: i.natural_account || "invoice",
      source: "invoice",
    })),
  ];

  combined.sort((a, b) => new Date(b.date) - new Date(a.date));

  const total = combined.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const categories = {};
  combined.forEach((e) => {
    const key = e.category || "other";
    categories[key] = (categories[key] || 0) + Number(e.amount || 0);
  });

  return (
    <AppShell>
      <div className="min-h-screen text-white p-6 max-w-5xl mx-auto space-y-10">

        <h1 className="text-3xl font-semibold">Expenses</h1>

        {/* SUMMARY */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <div className="bg-white/5 p-6 rounded-2xl">
            <p className="text-white/40 text-sm">Total</p>
            <h2 className="text-2xl mt-2 text-red-400">
              {total.toLocaleString()} THB
            </h2>
          </div>

          <div className="bg-white/5 p-6 rounded-2xl col-span-2">
            <p className="text-white/40 text-sm mb-2">Categories</p>
            <div className="flex flex-wrap gap-2 text-sm">
              {Object.keys(categories).map((key) => (
                <div key={key} className="bg-black/40 px-3 py-1 rounded">
                  {key}: {categories[key].toLocaleString()}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ADD */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (THB)"
            className="w-full px-4 py-2 rounded bg-black/40"
          />

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note"
            className="w-full px-4 py-2 rounded bg-black/40"
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-4 py-2 rounded bg-black/40"
          >
            <option value="general">General</option>
            <option value="food">Food</option>
            <option value="staff">Staff</option>
            <option value="rent">Rent</option>
            <option value="utilities">Utilities</option>
            <option value="marketing">Marketing</option>
          </select>

          <button
            onClick={addExpense}
            className="bg-[#ff7a00] px-4 py-2 rounded"
          >
            Add
          </button>

        </div>

        {/* LIST */}
        <div className="space-y-3">

          {combined.map((e) => (
            <div
              key={e.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center"
            >
              <div>
                <div>{e.label}</div>
                <div className="text-xs text-white/40">
                  {new Date(e.date).toLocaleDateString()} • {e.category} • {e.source}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-red-400">
                  {Number(e.amount).toLocaleString()} THB
                </div>

                {e.source === "manual" && (
                  <button
                    onClick={() => deleteExpense(e.id)}
                    className="text-xs text-white/40"
                  >
                    delete
                  </button>
                )}
              </div>
            </div>
          ))}

          {combined.length === 0 && (
            <div className="text-white/40">No expenses</div>
          )}

        </div>

      </div>
    </AppShell>
  );
}