"use client";

import { useEffect, useState } from "react";

export default function Accounting() {
  const [expenses, setExpenses] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({
    name: "",
    amount: "",
    category: "",
    image: null,
  });

  // LOAD DATA
  useEffect(() => {
    try {
      const storedExpenses = JSON.parse(localStorage.getItem("expenses")) || [];
      const storedHistory = JSON.parse(localStorage.getItem("history")) || [];

      setExpenses(storedExpenses);
      setHistory(storedHistory);
    } catch (e) {
      console.log("Load error:", e);
    }
  }, []);

  const totalExpenses = expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  const totalRevenue = history.reduce(
    (sum, d) => sum + Number(d.revenue || 0),
    0
  );

  const netProfit = totalRevenue - totalExpenses;

  const normalizeAmount = (value) => {
    if (!value) return "";

    return String(value)
      .replace(/[^\d.,-]/g, "")
      .replace(/,/g, "")
      .trim();
  };

  // ✅ FIXED SAVE (NO IMAGE REQUIRED)
  const addExpense = () => {
    console.log("ADD CLICKED");

    if (!form.name || !form.amount) {
      alert("Missing name or amount");
      return;
    }

    const newExpense = {
      name: form.name,
      amount: Number(normalizeAmount(form.amount)),
      category: form.category,
      date: new Date().toLocaleDateString("en-GB"),
    };

    setExpenses((prev) => {
      const updated = [newExpense, ...prev];

      try {
        localStorage.setItem("expenses", JSON.stringify(updated));
        console.log("SAVED:", updated);
      } catch (e) {
        console.error("SAVE ERROR:", e);
      }

      return updated;
    });

    setForm({
      name: "",
      amount: "",
      category: "",
      image: null,
    });
  };

  return (
    <div className="relative min-h-screen text-white">
      <div className="absolute inset-0 -z-10">
        <img
          src="/bg-hero-control.jpg"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="max-w-6xl mx-auto px-6 pt-24 space-y-8">
        <h1 className="text-4xl font-semibold">Accounting</h1>

        <div className="text-white/70">
          Expenses: THB {totalExpenses.toLocaleString()} | Revenue: THB{" "}
          {totalRevenue.toLocaleString()} | Profit: THB{" "}
          {netProfit.toLocaleString()}
        </div>

        {/* INPUTS */}
        <div className="grid md:grid-cols-4 gap-4">
          <input
            placeholder="Vendor"
            value={form.name}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, name: e.target.value }))
            }
            className="p-3 bg-black/40 rounded-xl"
          />

          <input
            placeholder="Amount"
            value={form.amount}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, amount: e.target.value }))
            }
            className="p-3 bg-black/40 rounded-xl"
          />

          <input
            placeholder="Category"
            value={form.category}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, category: e.target.value }))
            }
            className="p-3 bg-black/40 rounded-xl"
          />

          {/* ✅ ALWAYS VISIBLE BUTTON */}
          <button
            onClick={addExpense}
            className="bg-orange-500 rounded-xl px-4 py-2"
          >
            Add Expense
          </button>
        </div>

        {/* LIST */}
        <div className="space-y-3">
          {expenses.map((item, i) => (
            <div key={i} className="p-4 bg-black/30 rounded-xl">
              <div>{item.name}</div>
              <div>THB {item.amount}</div>
              <div>{item.category || "-"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}