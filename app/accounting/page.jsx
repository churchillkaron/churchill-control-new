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
  // 🔥 SMART PARSER (UPGRADED)
  // =========================
  const extractData = (text) => {
    const lines = text.split("\n");

    let amount = "";
    let vendor = "";

    // 🔥 STEP 1: Look for key financial labels
    const keywords = [
      "total",
      "grand total",
      "net total",
      "balance",
      "amount",
      "fee",
    ];

    for (let line of lines) {
      const lower = line.toLowerCase();

      if (keywords.some((k) => lower.includes(k))) {
        const match = line.match(/\d+[.,]?\d*/g);
        if (match) {
          amount = match[match.length - 1];
        }
      }
    }

    // 🔥 STEP 2: fallback = biggest number
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

    // 🔥 STEP 3: vendor detection
    vendor =
      lines.find(
        (l) =>
          l.length > 4 &&
          !l.match(/\d/) &&
          !l.toLowerCase().includes("invoice") &&
          !l.toLowerCase().includes("tax")
      ) || "";

    return { amount, vendor };
  };

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

    setForm({
      name: "",
      amount: "",
      category: "",
      image: null,
    });
  };

  return (
    <div className="min-h-screen text-white p-10">

      <h1 className="text-3xl mb-4">Accounting</h1>

      <input
        placeholder="Vendor"
        value={form.name}
        onChange={(e) =>
          setForm((prev) => ({ ...prev, name: e.target.value }))
        }
      />

      <input
        placeholder="Amount"
        value={form.amount}
        onChange={(e) =>
          setForm((prev) => ({ ...prev, amount: e.target.value }))
        }
      />

      <input
        placeholder="Category"
        value={form.category}
        onChange={(e) =>
          setForm((prev) => ({ ...prev, category: e.target.value }))
        }
      />

      <input type="file" onChange={handleImageUpload} />

      {form.image && (
        <div>
          <img src={form.image} className="w-40 mt-2" />

          <button onClick={runOCR}>
            Auto Read Receipt
          </button>
        </div>
      )}

      <button onClick={addExpense}>
        Add Expense
      </button>

      <div className="mt-6">
        {expenses.map((e, i) => (
          <div key={i}>
            {e.name} - {e.amount}
          </div>
        ))}
      </div>

    </div>
  );
}