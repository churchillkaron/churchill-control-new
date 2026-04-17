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
  // PARSER LOGIC
  // =========================
  const extractData = (text) => {
    let amount = "";
    let vendor = "";

    const lines = text.split("\n");

    let maxNumber = 0;

    lines.forEach((line) => {
      const numbers = line.match(/\d+[.,]?\d*/g);

      if (numbers) {
        numbers.forEach((n) => {
          const value = parseFloat(n.replace(",", ""));
          if (value > maxNumber) {
            maxNumber = value;
            amount = value;
          }
        });
      }
    });

    vendor =
      lines.find((l) => l.length > 3 && !l.match(/\d/)) || "";

    return { amount, vendor };
  };

  // =========================
  // OCR
  // =========================
  const runOCR = async () => {
    if (!form.image) return;

    const res = await fetch("/api/ocr", {
      method: "POST",
      body: JSON.stringify({ image: form.image }),
    });

    const data = await res.json();

    if (!data.text) return;

    const parsed = extractData(data.text);

    setForm({
      ...form,
      name: parsed.vendor || "",
      amount: parsed.amount || "",
    });
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
            placeholder="Vendor / Name"
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

          <input type="file" onChange={handleImageUpload} />

          {form.image && (
            <div>
              <img
                src={form.image}
                className="w-40 mt-2 rounded"
              />

              <button
                onClick={runOCR}
                className="bg-blue-500 px-4 py-2 mt-2 rounded"
              >
                Auto Read Receipt
              </button>
            </div>
          )}

          <button
            onClick={addExpense}
            className="bg-orange-500 px-4 py-2 rounded"
          >
            Add Expense
          </button>

        </div>

        {/* LIST */}
        <div>
          {expenses.map((item, i) => (
            <div key={i} className="border p-4 mt-2 rounded">

              <div className="font-semibold">{item.name}</div>
              <div>THB {item.amount}</div>
              <div className="text-sm text-white/50">
                {item.category}
              </div>

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