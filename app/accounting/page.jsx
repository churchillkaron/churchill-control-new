"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function Accounting() {
  const [expenses, setExpenses] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({
    name: "",
    amount: "",
    category: "",
    image: null,
  });
  const [ocrStatus, setOcrStatus] = useState("");
  const [parsedPreview, setParsedPreview] = useState({
    name: "",
    amount: "",
  });

  useEffect(() => {
    loadData();

    const handleStorageChange = () => {
      loadData();
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const loadData = () => {
    const storedExpenses =
      JSON.parse(localStorage.getItem("expenses")) || [];
    const storedHistory =
      JSON.parse(localStorage.getItem("history")) || [];

    setExpenses(storedExpenses);
    setHistory(storedHistory);
  };

  const totalExpenses = expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  const totalRevenue = history.reduce(
    (sum, d) => sum + Number(d.total || 0),
    0
  );

  const totalServiceCharge = history.reduce(
    (sum, d) => sum + Number(d.serviceCharge || 0),
    0
  );

  const netProfit = totalRevenue - totalExpenses;

  const profitMargin =
    totalRevenue > 0
      ? Math.round((netProfit / totalRevenue) * 100)
      : 0;

  const categoryMap = {};
  expenses.forEach((e) => {
    const key = e.category || "Other";
    if (!categoryMap[key]) categoryMap[key] = 0;
    categoryMap[key] += Number(e.amount || 0);
  });

  // OCR (UNCHANGED)
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      setForm((prev) => ({
        ...prev,
        image: reader.result,
      }));
      setOcrStatus("");
      setParsedPreview({ name: "", amount: "" });
    };

    reader.readAsDataURL(file);
  };

  const runOCR = async () => {
    if (!form.image) {
      alert("Upload receipt first");
      return;
    }

    try {
      setOcrStatus("Reading receipt...");

      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: form.image }),
      });

      const data = await res.json();

      if (!data?.data) {
        setOcrStatus("OCR failed");
        return;
      }

      const parsed = {
        name: data.data.vendor || "",
        amount: data.data.total_amount || "",
      };

      setParsedPreview(parsed);

      setForm((prev) => ({
        ...prev,
        name: parsed.name || prev.name,
        amount: parsed.amount || prev.amount,
      }));

      setOcrStatus("OCR complete");
    } catch (err) {
      setOcrStatus("OCR error");
    }
  };

  const normalizeAmount = (value) => {
    if (!value) return "";

    return String(value)
      .replace(/[^\d.-]/g, "")
      .replace(/,/g, "");
  };

  const addExpense = () => {
    if (!form.name || !form.amount) {
      alert("Missing data");
      return;
    }

    const newExpense = {
      ...form,
      amount: Number(normalizeAmount(form.amount)),
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

    setParsedPreview({ name: "", amount: "" });
    setOcrStatus("");
  };

  const deleteExpense = (index) => {
    const updated = expenses.filter((_, i) => i !== index);
    localStorage.setItem("expenses", JSON.stringify(updated));
    setExpenses(updated);
  };

  return (
    <AppShell>
      <div className="space-y-14">

        <div>
          <h1 className="text-3xl text-white/90">Accounting</h1>
          <p className="text-white/50 text-sm">
            Financial control and expense management
          </p>
        </div>

        {/* HERO */}
        <div className="grid md:grid-cols-5 gap-6">
          <Card label="Revenue" value={`THB ${totalRevenue.toLocaleString()}`} />
          <Card label="Expenses" value={`THB ${totalExpenses.toLocaleString()}`} />
          <Card label="Profit" value={`THB ${netProfit.toLocaleString()}`} highlight />
          <Card label="Margin" value={`${profitMargin}%`} />
          <Card label="Service" value={`THB ${totalServiceCharge.toLocaleString()}`} />
        </div>

        {/* CATEGORY BREAKDOWN */}
        <div className="bg-white/5 p-6 rounded-2xl backdrop-blur">
          <h2 className="text-white mb-4">Expense Breakdown</h2>
          {Object.keys(categoryMap).length === 0 && (
            <p className="text-white/40">No data</p>
          )}
          {Object.entries(categoryMap).map(([cat, val]) => (
            <div key={cat} className="flex justify-between text-white/80">
              <span>{cat}</span>
              <span>THB {val}</span>
            </div>
          ))}
        </div>

        {/* FORM */}
        <div className="bg-white/5 p-6 rounded-2xl backdrop-blur">
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <input
              placeholder="Vendor"
              value={form.name}
              onChange={(e) =>
                setForm({ ...form, name: e.target.value })
              }
              className="bg-black/30 p-3 rounded"
            />
            <input
              placeholder="Amount"
              value={form.amount}
              onChange={(e) =>
                setForm({ ...form, amount: e.target.value })
              }
              className="bg-black/30 p-3 rounded"
            />
            <input
              placeholder="Category"
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value })
              }
              className="bg-black/30 p-3 rounded"
            />
          </div>

          <div className="flex gap-3">
            <input type="file" onChange={handleImageUpload} />
            <button onClick={runOCR} className="bg-blue-500 px-4 py-2 rounded">
              OCR
            </button>
            <button onClick={addExpense} className="bg-orange-500 px-4 py-2 rounded">
              Add Expense
            </button>
          </div>

          {ocrStatus && (
            <p className="text-sm text-white/60 mt-2">{ocrStatus}</p>
          )}
        </div>

        {/* EXPENSE LIST */}
        <div className="bg-white/5 p-6 rounded-2xl backdrop-blur">
          <h2 className="text-white mb-4">Expenses</h2>

          {expenses.length === 0 && (
            <p className="text-white/40">No expenses yet</p>
          )}

          {expenses.map((e, i) => (
            <div key={i} className="flex justify-between py-2 border-b border-white/10">
              <div>
                <p>{e.name}</p>
                <p className="text-sm text-white/50">{e.category}</p>
              </div>
              <div className="flex gap-4">
                <span>THB {e.amount}</span>
                <button onClick={() => deleteExpense(i)}>X</button>
              </div>
            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}

function Card({ label, value, highlight }) {
  return (
    <div className={`p-5 rounded-2xl backdrop-blur bg-white/5 border border-white/10 ${highlight ? "text-orange-400" : "text-white"}`}>
      <p className="text-sm opacity-60">{label}</p>
      <p className="text-xl mt-1">{value}</p>
    </div>
  );
}