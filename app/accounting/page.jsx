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

  // 🔥 FINANCIAL CALCULATIONS
  const totalExpenses = expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  const totalRevenue = history.reduce(
    (sum, d) => sum + Number(d.revenue || 0),
    0
  );

  const netProfit = totalRevenue - totalExpenses;

  const profitMargin =
    totalRevenue > 0
      ? Math.round((netProfit / totalRevenue) * 100)
      : 0;

  // 🔥 CATEGORY BREAKDOWN
  const categoryMap = {};
  expenses.forEach((e) => {
    const key = e.category || "Other";
    if (!categoryMap[key]) categoryMap[key] = 0;
    categoryMap[key] += Number(e.amount || 0);
  });

  // 🔥 OCR
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

  // 🔥 DELETE EXPENSE (IMPORTANT CONTROL)
  const deleteExpense = (index) => {
    const updated = expenses.filter((_, i) => i !== index);
    localStorage.setItem("expenses", JSON.stringify(updated));
    setExpenses(updated);
  };

  return (
    <AppShell>
      <div className="space-y-14">

        {/* HEADER */}
        <div>
          <h1 className="text-3xl text-white/90">Accounting</h1>
          <p className="text-white/50 text-sm">
            Financial control and expense management
          </p>
        </div>

        {/* 🔥 HERO */}
        <div className="grid md:grid-cols-4 gap-6">

          <Card label="Revenue" value={`THB ${totalRevenue.toLocaleString()}`} />
          <Card label="Expenses" value={`THB ${totalExpenses.toLocaleString()}`} />
          <Card label="Profit" value={`THB ${netProfit.toLocaleString()}`} highlight />
          <Card label="Margin" value={`${profitMargin}%`} />

        </div>

        {/* 🔥 CATEGORY INSIGHT */}
        <div className="bg-white/[0.05] border border-white/10 p-6 rounded-2xl">
          <h2 className="mb-4 text-white/70">Expense Breakdown</h2>

          {Object.entries(categoryMap).map(([cat, value]) => (
            <div key={cat} className="flex justify-between text-sm py-1">
              <span>{cat}</span>
              <span>THB {value.toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* 🔥 FORM */}
        <div className="bg-white/[0.05] border border-white/10 p-6 rounded-2xl space-y-4">

          <div className="grid md:grid-cols-3 gap-4">
            <input
              placeholder="Vendor"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              className="p-3 bg-black/30 border border-white/10 rounded-xl"
            />

            <input
              placeholder="Amount"
              value={form.amount}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, amount: e.target.value }))
              }
              className="p-3 bg-black/30 border border-white/10 rounded-xl"
            />

            <input
              placeholder="Category"
              value={form.category}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, category: e.target.value }))
              }
              className="p-3 bg-black/30 border border-white/10 rounded-xl"
            />
          </div>

          <input type="file" accept="image/*" onChange={handleImageUpload} />

          <div className="flex gap-3">
            <button onClick={runOCR} className="bg-blue-500 px-4 py-2 rounded-xl">
              OCR
            </button>

            <button onClick={addExpense} className="bg-[#ff7a00] px-4 py-2 rounded-xl text-black">
              Add Expense
            </button>
          </div>

          {ocrStatus && (
            <div className="text-sm text-white/60">{ocrStatus}</div>
          )}

        </div>

        {/* 🔥 EXPENSE LIST */}
        <div className="bg-white/[0.05] border border-white/10 p-6 rounded-2xl">
          <h2 className="mb-4 text-white/70">Expenses</h2>

          {expenses.map((item, i) => (
            <div
              key={i}
              className="flex justify-between items-center py-3 border-b border-white/10"
            >
              <div>
                <div>{item.name}</div>
                <div className="text-xs text-white/40">
                  {item.category || "-"}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div>THB {Number(item.amount).toLocaleString()}</div>

                <button
                  onClick={() => deleteExpense(i)}
                  className="text-red-400 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

        </div>

      </div>
    </AppShell>
  );
}

/* COMPONENT */

function Card({ label, value, highlight }) {
  return (
    <div className="bg-white/[0.05] border border-white/10 p-6 rounded-2xl">
      <div className="text-white/40 text-sm">{label}</div>
      <div
        className={`text-xl mt-1 ${
          highlight ? "text-[#ff7a00] font-medium" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}