"use client";

import { useState } from "react";
import AppShell from "../../AppShell";

export default function InvoiceAI() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(false);

  const accounts = [
    "Food Cost",
    "Beverage Cost",
    "Supplies",
    "Equipment",
    "Other Expense",
  ];

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;

    setFile(f);

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
    };
    reader.readAsDataURL(f);
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/invoice-ai", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setResult(data);
    setLoading(false);
  };

  const handleSave = () => {
    if (!account) {
      alert("Select account");
      return;
    }

    const existing =
      JSON.parse(localStorage.getItem("expenses") || "[]");

    const newExpense = {
      ...result,
      account,
      created_at: new Date().toISOString(),
    };

    localStorage.setItem(
      "expenses",
      JSON.stringify([newExpense, ...existing])
    );

    alert("Saved to accounting ✅");

    setResult(null);
    setAccount("");
    setFile(null);
    setPreview(null);
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Invoice AI</h1>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <input type="file" onChange={handleFile} />

          {preview && (
            <img src={preview} className="rounded-xl max-h-64" />
          )}

          <button
            onClick={handleAnalyze}
            className="bg-[#ff7a00] px-6 py-3 rounded-xl"
          >
            {loading ? "Analyzing..." : "Analyze Invoice"}
          </button>

        </div>

        {result && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">

            <h2 className="text-xl">AI Result</h2>

            <div>
              Vendor: {result.vendor}
            </div>
            <div>
              Date: {result.date}
            </div>
            <div>
              Total: {result.total} THB
            </div>

            {/* 🔥 ACCOUNT SELECT */}
            <div className="space-y-2">
              <div className="text-white/60">Select Account</div>

              <select
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="w-full p-3 bg-black/40 rounded-xl"
              >
                <option value="">-- Select --</option>
                {accounts.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* ITEMS */}
            <div className="space-y-2">
              {result.items?.map((item, i) => (
                <div
                  key={i}
                  className="flex justify-between bg-white/5 p-3 rounded"
                >
                  <span>{item.name}</span>
                  <span>{item.price} THB</span>
                </div>
              ))}
            </div>

            {/* SAVE */}
            <button
              onClick={handleSave}
              className="bg-green-600 px-6 py-3 rounded-xl"
            >
              Save to Accounting
            </button>

          </div>
        )}

      </div>
    </AppShell>
  );
}