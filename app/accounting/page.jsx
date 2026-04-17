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
  const [ocrStatus, setOcrStatus] = useState("");
  const [parsedPreview, setParsedPreview] = useState({
    name: "",
    amount: "",
  });

  // ✅ LOAD FROM LOCAL STORAGE (SAFE)
  useEffect(() => {
    try {
      const storedExpenses = JSON.parse(localStorage.getItem("expenses")) || [];
      const storedHistory = JSON.parse(localStorage.getItem("history")) || [];

      setExpenses(storedExpenses);
      setHistory(storedHistory);
    } catch (e) {
      console.log("Storage load error:", e);
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
      alert("Please upload an image first");
      return;
    }

    try {
      setOcrStatus("Reading receipt...");
      setParsedPreview({ name: "", amount: "" });

      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: form.image }),
      });

      const data = await res.json();

      if (!res.ok || !data.data) {
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

      setOcrStatus("OCR finished");
    } catch (error) {
      setOcrStatus(`OCR error: ${error.message}`);
    }
  };

  const normalizeAmount = (value) => {
    if (!value) return "";

    const cleaned = String(value)
      .replace(/บาท/g, "")
      .replace(/thb/gi, "")
      .replace(/[^\d.,-]/g, "")
      .trim();

    return cleaned.replace(/,/g, "");
  };

  // ✅ FIXED SAVE (NO OVERWRITE, PRODUCTION SAFE)
  const addExpense = () => {
    if (!form.name || !form.amount) {
      alert("Missing name or amount");
      return;
    }

    const newExpense = {
      ...form,
      amount: Number(normalizeAmount(form.amount)),
      date: new Date().toLocaleDateString("en-GB"),
    };

    setExpenses((prevExpenses) => {
      const updated = [newExpense, ...prevExpenses];

      try {
        localStorage.setItem("expenses", JSON.stringify(updated));
      } catch (e) {
        console.log("Storage save error:", e);
      }

      return updated;
    });

    setForm({
      name: "",
      amount: "",
      category: "",
      image: null,
    });
    setOcrStatus("");
    setParsedPreview({ name: "", amount: "" });
  };

  return (
    <div className="relative min-h-screen text-white overflow-hidden">
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          alt="Accounting background"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-24 pb-16 space-y-8">
        <div>
          <h1 className="text-3xl md:text-5xl font-semibold">Accounting</h1>
          <p className="text-white/60 mt-2">
            Expenses: THB {totalExpenses.toLocaleString()} | Revenue: THB{" "}
            {totalRevenue.toLocaleString()} | Profit: THB{" "}
            {netProfit.toLocaleString()}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <input
              placeholder="Vendor"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              className="p-3 rounded-xl bg-black/30 border border-white/10"
            />

            <input
              placeholder="Amount"
              value={form.amount}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, amount: e.target.value }))
              }
              className="p-3 rounded-xl bg-black/30 border border-white/10"
            />

            <input
              placeholder="Category"
              value={form.category}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, category: e.target.value }))
              }
              className="p-3 rounded-xl bg-black/30 border border-white/10"
            />
          </div>

          <input type="file" accept="image/*" onChange={handleImageUpload} />

          {form.image && (
            <div className="space-y-3">
              <img
                src={form.image}
                alt="Uploaded receipt"
                className="w-48 rounded-xl border border-white/10"
              />

              <div className="flex gap-3">
                <button
                  onClick={runOCR}
                  className="bg-blue-500 px-4 py-2 rounded-xl"
                >
                  Auto Read Receipt
                </button>

                <button
                  onClick={addExpense}
                  className="bg-orange-500 px-4 py-2 rounded-xl"
                >
                  Add Expense
                </button>
              </div>
            </div>
          )}

          {ocrStatus && (
            <div className="text-sm text-white/70">{ocrStatus}</div>
          )}

          {(parsedPreview.name || parsedPreview.amount) && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div>Name: {parsedPreview.name || "-"}</div>
              <div>Amount: {parsedPreview.amount || "-"}</div>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/30 p-6">
          <h2 className="text-xl font-semibold mb-4">Expenses</h2>

          <div className="space-y-3">
            {expenses.map((item, i) => (
              <div key={i} className="p-4 border border-white/10 rounded-xl">
                <div>{item.name}</div>
                <div>THB {Number(item.amount).toLocaleString()}</div>
                <div>{item.category || "-"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}