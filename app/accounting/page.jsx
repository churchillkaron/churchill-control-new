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
  // IMAGE UPLOAD
  // =========================
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      setForm({ ...form, image: reader.result });
    };

    reader.readAsDataURL(file);
  };

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

    setForm({ name: "", amount: "", category: "", image: null });
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
        <h1 className="text-3xl md:text-5xl font-semibold">
          Accounting
        </h1>

        {/* HERO */}
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            Expenses: THB {totalExpenses.toLocaleString()}
          </div>
          <div>
            Revenue: THB {totalRevenue.toLocaleString()}
          </div>
          <div>
            Profit: THB {netProfit.toLocaleString()}
          </div>
        </div>

        {/* ADD EXPENSE */}
        <div className="space-y-4">

          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
          />

          <input
            placeholder="Amount"
            type="number"
            value={form.amount}
            onChange={(e) =>
              setForm({ ...form, amount: e.target.value })
            }
          />

          <input
            placeholder="Category"
            value={form.category}
            onChange={(e) =>
              setForm({ ...form, category: e.target.value })
            }
          />

          {/* IMAGE INPUT */}
          <input type="file" onChange={handleImageUpload} />

          {/* PREVIEW */}
          {form.image && (
            <img
              src={form.image}
              className="w-32 mt-2 rounded"
            />
          )}

          <button onClick={addExpense}>
            Add Expense
          </button>

        </div>

        {/* LIST */}
        <div>
          {expenses.map((item, i) => (
            <div key={i} className="border p-4 mt-2">

              <div>{item.name}</div>
              <div>THB {item.amount}</div>
              <div>{item.category}</div>

              {item.image && (
                <img
                  src={item.image}
                  className="w-32 mt-2 rounded"
                />
              )}

            </div>
          ))}
        </div>

      </div>
    </div>
  );
}