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

    const updated = [newExpense, ...expenses];

    localStorage.setItem("expenses", JSON.stringify(updated));
    setExpenses(updated);

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
    <AppShell>
      <div className="space-y-14">

        {/* HEADER */}
        <div className="space-y-2">
          <h1 className="text-3xl font-medium text-white/90">
            Accounting
          </h1>
          <p className="text-white/50 text-sm">
            Expense tracking, OCR receipts, and profit overview
          </p>
        </div>

        {/* FINANCIAL HERO */}
        <div className="relative">
          <div className="absolute -inset-6 bg-[#ff7a00]/10 blur-3xl rounded-[32px]" />

          <div className="relative rounded-[28px] border border-white/10 bg-white/[0.06] backdrop-blur-xl p-8 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">

            <div className="grid md:grid-cols-3 gap-6 text-sm">

              <div>
                <div className="text-white/40">Expenses</div>
                <div className="text-lg">
                  THB {totalExpenses.toLocaleString()}
                </div>
              </div>

              <div>
                <div className="text-white/40">Revenue</div>
                <div className="text-lg">
                  THB {totalRevenue.toLocaleString()}
                </div>
              </div>

              <div>
                <div className="text-white/40">Profit</div>
                <div className="text-lg text-[#ff7a00] font-medium">
                  THB {netProfit.toLocaleString()}
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* EXPENSE FORM */}
        <div className="relative">
          <div className="absolute -inset-4 bg-white/5 blur-2xl rounded-3xl" />

          <div className="relative rounded-3xl border border-white/10 bg-white/[0.05] p-6 space-y-4">

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
                  alt="receipt"
                  className="w-40 rounded-xl border border-white/10"
                />

                <div className="flex gap-3">
                  <button
                    onClick={runOCR}
                    className="bg-blue-500 px-4 py-2 rounded-xl"
                  >
                    OCR
                  </button>

                  <button
                    onClick={addExpense}
                    className="bg-[#ff7a00] text-black px-4 py-2 rounded-xl"
                  >
                    Add Expense
                  </button>
                </div>
              </div>
            )}

            {ocrStatus && (
              <div className="text-sm text-white/60">{ocrStatus}</div>
            )}

            {(parsedPreview.name || parsedPreview.amount) && (
              <div className="bg-black/30 p-4 rounded-xl border border-white/10">
                <div>Name: {parsedPreview.name || "-"}</div>
                <div>Amount: {parsedPreview.amount || "-"}</div>
              </div>
            )}

          </div>
        </div>

        {/* EXPENSE LIST */}
        <div className="relative">
          <div className="absolute -inset-4 bg-white/5 blur-2xl rounded-3xl" />

          <div className="relative rounded-3xl border border-white/10 bg-white/[0.05] p-6">
            <h2 className="text-xl mb-4 text-white/80">Expenses</h2>

            <div className="space-y-3">
              {expenses.map((item, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl border border-white/10 bg-black/30 flex justify-between"
                >
                  <div>
                    <div>{item.name}</div>
                    <div className="text-white/40 text-sm">
                      {item.category || "-"}
                    </div>
                  </div>

                  <div>
                    THB {Number(item.amount).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>

      </div>
    </AppShell>
  );
}