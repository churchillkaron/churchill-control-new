"use client";

import { useEffect, useState } from "react";

export default function Accounting() {
  const [expenses, setExpenses] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({
    name: "",
    amount: "",
    category: "",
  });

  useEffect(() => {
    const storedExpenses =
      JSON.parse(localStorage.getItem("expenses")) || [];

    const storedHistory =
      JSON.parse(localStorage.getItem("history")) || [];

    setExpenses(storedExpenses);
    setHistory(storedHistory);
  }, []);

  // =========================
  // CALCULATIONS
  // =========================
  const totalExpenses = expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  const totalRevenue = history.reduce(
    (sum, d) => sum + Number(d.revenue || 0),
    0
  );

  const netProfit = totalRevenue - totalExpenses;

  // =========================
  // ADD EXPENSE
  // =========================
  const addExpense = () => {
    if (!form.name || !form.amount) return;

    const newExpense = {
      ...form,
      amount: Number(form.amount),
      date: new Date().toLocaleDateString("en-GB"),
    };

    const updated = [newExpense, ...expenses];

    localStorage.setItem("expenses", JSON.stringify(updated));
    setExpenses(updated);

    setForm({ name: "", amount: "", category: "" });
  };

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          alt="Accounting background"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.75),rgba(18,12,8,0.85))]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_20%,rgba(255,140,0,0.15),transparent_40%)]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 pt-28 pb-14 space-y-8">

        {/* HEADER */}
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            Accounting
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Cost Control
          </h1>
        </div>

        {/* HERO */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 md:p-8">

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <div>
              <p className="text-white/50 text-sm">Total Expenses</p>
              <h2 className="text-3xl mt-2">
                THB {totalExpenses.toLocaleString()}
              </h2>
            </div>

            <div>
              <p className="text-white/50 text-sm">Revenue</p>
              <h2 className="text-3xl mt-2">
                THB {totalRevenue.toLocaleString()}
              </h2>
            </div>

            <div>
              <p className="text-white/50 text-sm">Net Profit</p>
              <h2 className="text-3xl mt-2 text-[#ffb36b]">
                THB {netProfit.toLocaleString()}
              </h2>
            </div>

          </div>
        </div>

        {/* ADD EXPENSE */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] p-6">

          <h3 className="text-xl mb-4">Add Expense</h3>

          <div className="grid md:grid-cols-3 gap-4">

            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) =>
                setForm({ ...form, name: e.target.value })
              }
              className="p-3 rounded bg-black/30 border border-white/10"
            />

            <input
              placeholder="Amount"
              type="number"
              value={form.amount}
              onChange={(e) =>
                setForm({ ...form, amount: e.target.value })
              }
              className="p-3 rounded bg-black/30 border border-white/10"
            />

            <input
              placeholder="Category"
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value })
              }
              className="p-3 rounded bg-black/30 border border-white/10"
            />

          </div>

          <button
            onClick={addExpense}
            className="mt-4 bg-orange-500 px-4 py-2 rounded"
          >
            Add Expense
          </button>

        </div>

        {/* EXPENSE LIST */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] p-6">

          <h3 className="text-xl mb-4">Expenses</h3>

          <div className="space-y-3">

            {expenses.map((item, i) => (
              <div
                key={i}
                className="flex justify-between p-4 bg-black/30 rounded-xl border border-white/10"
              >
                <div>
                  <p className="text-sm text-white/50">
                    {item.date}
                  </p>
                  <p>{item.name}</p>
                </div>

                <div>
                  THB {Number(item.amount).toLocaleString()}
                </div>

                <div className="text-white/50">
                  {item.category || "-"}
                </div>
              </div>
            ))}

          </div>

        </div>

      </div>
    </div>
  );
}