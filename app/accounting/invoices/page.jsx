"use client";

import { useState } from "react";
import AppShell from "../../AppShell";

export default function InvoiceAI() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(false);

  // 🔥 YOUR REAL STRUCTURE
  const accounts = {
    "COGS": {
      "Kitchen": [
        "Food Main Kitchen",
        "Food Thai Kitchen",
        "Pizza Kitchen",
      ],
      "Bar": [
        "Alcohol",
        "Soft Drinks",
      ],
      "Breakfast": [
        "Breakfast Food",
      ],
    },
    "Operating Expense": {
      "Entertainment": [
        "DJ",
        "Band",
        "Acoustic",
        "Events",
      ],
      "Staff Welfare": [
        "Staff Food",
        "Staff Drinks",
        "Staff Rewards",
        "Staff Tax",
        "SSO",
      ],
      "Operations": [
        "Cleaning",
        "Decoration",
        "Maintenance",
        "Restaurant Supplies",
        "Transportation",
        "Kitchen Supplies",
        "Bar Supplies",
        "Bar Equipment",
      ],
      "Admin": [
        "Rent",
        "Accounting Fees",
        "Software",
        "Depreciation",
        "Salaries",
        "Overtime",
        "Service Charge",
        "Postage",
      ],
      "Utilities": [
        "Electricity",
        "Gas",
      ],
      "Marketing": [
        "Ads",
        "Social Media",
        "Promotions",
        "Content Creation",
      ],
      "Other": [
        "Miscellaneous",
        "Police / Irregular",
      ],
    },
    "Owner / Non-Operating": [
      "Owner Funding",
      "Owner Withdrawal",
    ],
  };

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

    alert("Saved ✅");

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

            <div>Vendor: {result.vendor}</div>
            <div>Date: {result.date}</div>
            <div>Total: {result.total} THB</div>

            {/* 🔥 STRUCTURED ACCOUNT PICKER */}
            <div className="space-y-3">
              <div className="text-white/60">Select Account</div>

              <select
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="w-full p-3 bg-black/40 rounded-xl"
              >
                <option value="">-- Select Account --</option>

                {Object.entries(accounts).map(([type, groups]) => {
                  if (Array.isArray(groups)) {
                    return groups.map((acc) => (
                      <option key={acc} value={acc}>
                        {type} → {acc}
                      </option>
                    ));
                  }

                  return Object.entries(groups).flatMap(
                    ([dept, items]) =>
                      items.map((item) => (
                        <option key={item} value={item}>
                          {type} → {dept} → {item}
                        </option>
                      ))
                  );
                })}
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