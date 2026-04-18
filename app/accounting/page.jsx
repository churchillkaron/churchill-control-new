"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function AccountingPage() {
  const [history, setHistory] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const h = JSON.parse(localStorage.getItem("history") || "[]");
    const e = JSON.parse(localStorage.getItem("expenses") || "[]");

    setHistory(h);
    setExpenses(e);
  }, []);

  const latestDay =
    history[history.length - 1] || null;

  const revenue = latestDay?.revenue || 0;
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const profit = revenue - totalExpenses;

  // 🔥 AI OCR (OpenAI Vision)
  const runOCR = async () => {
    if (!file) return;

    setLoading(true);

    const reader = new FileReader();

    reader.onload = async () => {
      const base64 = reader.result;

      const res = await fetch("/api/invoice-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: base64 }),
      });

      const data = await res.json();

      if (!data.error) {
        setVendor(data.vendor || "");
        setAmount(data.total || "");
        setCategory(data.category || "General");
      }

      setLoading(false);
    };

    reader.readAsDataURL(file);
  };

  const addExpense = () => {
    if (!vendor || !amount) return;

    const newExpense = {
      id: Date.now(),
      vendor,
      amount: Number(amount),
      category,
    };

    const updated = [newExpense, ...expenses];

    localStorage.setItem("expenses", JSON.stringify(updated));
    setExpenses(updated);

    setVendor("");
    setAmount("");
    setCategory("");
    setFile(null);
  };

  return (
    <AppShell>
      <div className="space-y-10">

        <div>
          <h1 className="text-3xl text-white">Accounting</h1>
          <p className="text-white/50 text-sm">
            Financial control and expense management
          </p>
        </div>

        {/* SUMMARY */}
        <div className="grid grid-cols-3 gap-6">
          <div>Revenue: THB {revenue}</div>
          <div>Expenses: THB {totalExpenses}</div>
          <div>Profit: THB {profit}</div>
        </div>

        {/* INPUT */}
        <div className="bg-white/5 p-6 rounded-2xl space-y-4">

          <div className="grid grid-cols-3 gap-4">
            <input
              placeholder="Vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="px-3 py-2 rounded bg-black/40 text-white"
            />

            <input
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="px-3 py-2 rounded bg-black/40 text-white"
            />

            <input
              placeholder="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 rounded bg-black/40 text-white"
            />
          </div>

          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
          />

          <div className="flex gap-3">
            <button
              onClick={runOCR}
              className="bg-blue-500 px-4 py-2 rounded"
            >
              OCR
            </button>

            <button
              onClick={addExpense}
              className="bg-[#ff7a00] px-4 py-2 rounded"
            >
              Add Expense
            </button>
          </div>

          {loading && <p className="text-white/50">Reading invoice...</p>}
        </div>

        {/* EXPENSE LIST */}
        <div className="bg-white/5 p-6 rounded-2xl">
          <h2 className="text-white mb-3">Expenses</h2>

          {expenses.length === 0 && (
            <p className="text-white/40">No expenses yet</p>
          )}

          {expenses.map((e) => (
            <div key={e.id} className="flex justify-between py-2">
              <span>{e.vendor}</span>
              <span>THB {e.amount}</span>
            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}