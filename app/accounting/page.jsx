"use client";

import { useEffect, useState } from "react";

export default function Accounting() {
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState({
    name: "",
    amount: "",
    category: "",
  });

  // LOAD
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("expenses")) || [];
    setExpenses(stored);
  }, []);

  const total = expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  const addExpense = () => {
    if (!form.name || !form.amount) {
      alert("Missing name or amount");
      return;
    }

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
    <div className="min-h-screen text-white p-10">
      <h1 className="text-4xl mb-6">Accounting</h1>

      <div className="mb-4">
        Total Expenses: THB {total.toLocaleString()}
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <input
          placeholder="Vendor"
          value={form.name}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, name: e.target.value }))
          }
          className="p-2 bg-black/40"
        />

        <input
          placeholder="Amount"
          value={form.amount}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, amount: e.target.value }))
          }
          className="p-2 bg-black/40"
        />

        <input
          placeholder="Category"
          value={form.category}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, category: e.target.value }))
          }
          className="p-2 bg-black/40"
        />

        <button
          onClick={addExpense}
          className="bg-orange-500 px-4 py-2"
        >
          Add Expense
        </button>
      </div>

      <div>
        {expenses.map((e, i) => (
          <div key={i} className="mb-2">
            {e.name} - THB {e.amount} ({e.category})
          </div>
        ))}
      </div>
    </div>
  );
}