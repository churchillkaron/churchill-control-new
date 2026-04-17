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
      setForm((prev) => ({
        ...prev,
        image: reader.result,
      }));
    };

    reader.readAsDataURL(file);
  };

  // =========================
  // PARSER
  // =========================
  const extractData = (text) => {
    const lines = text.split("\n");

    let amount = "";
    let vendor = "";

    // find TOTAL
    for (let line of lines) {
      const lower = line.toLowerCase();

      if (
        lower.includes("total") ||
        lower.includes("grand total")
      ) {
        const match = line.match(/\d+[.,]?\d*/g);
        if (match) {
          amount = match[match.length - 1];
          break;
        }
      }
    }

    // fallback biggest number
    if (!amount) {
      let max = 0;

      lines.forEach((line) => {
        const nums = line.match(/\d+[.,]?\d*/g);
        if (nums) {
          nums.forEach((n) => {
            const val = parseFloat(n.replace(",", ""));
            if (val > max) {
              max = val;
              amount = val;
            }
          });
        }
      });
    }

    vendor =
      lines.find(
        (l) =>
          l.length > 4 &&
          !l.match(/\d/) &&
          !l.toLowerCase().includes("invoice")
      ) || "";

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

    setForm((prev) => ({
      ...prev,
      name: parsed.vendor || "",
      amount: parsed.amount || "",
    }));
  };

  // =========================
  // ADD EXPENSE (FIXED)
  // =========================
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

    // reset form
    setForm({
      name: "",
      amount: "",
      category: "",
      image: null,
    });
  };

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      <div className="relative z-10 max-w-5xl mx-auto pt-20 space-y-6">

        <h1 className="text-3xl">Accounting</h1>

        <div>
          Expenses: {totalExpenses} | Revenue: {totalRevenue} | Profit: {netProfit}
        </div>

        {/* FORM */}
        <div className="space-y-3">

          <input
            placeholder="Vendor"
            value={form.name}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                name: e.target.value,
              }))
            }
          />

          <input
            placeholder="Amount"
            value={form.amount}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                amount: e.target.value,
              }))
            }
          />

          <input
            placeholder="Category"
            value={form.category}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                category: e.target.value,
              }))
            }
          />

          <input type="file" onChange={handleImageUpload} />

          {form.image && (
            <div>
              <img src={form.image} className="w-32" />
              <button onClick={runOCR}>
                Auto Read Receipt
              </button>
            </div>
          )}

          <button onClick={addExpense}>
            Add Expense
          </button>

        </div>

        {/* LIST */}
        <div>
          {expenses.map((item, i) => (
            <div key={i}>
              {item.name} - {item.amount}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}