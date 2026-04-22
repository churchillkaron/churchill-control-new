"use client";

import { useState } from "react";
import AppShell from "../../AppShell";

export default function InvoiceAI() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const accounts = [
    "Food Main Kitchen",
    "Food Thai Kitchen",
    "Pizza Kitchen",
    "Alcohol",
    "Soft Drinks",
    "Breakfast Food",
    "Cleaning",
    "Maintenance",
    "Restaurant Supplies",
    "Kitchen Supplies",
    "Bar Supplies",
    "Rent",
    "Electricity",
    "Gas",
    "Ads",
    "Other Expense",
  ];

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;

    setFile(f);

    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(f);
  };

  const analyzeInvoice = async () => {
    if (!file) return;

    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/invoice-ai", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setResult(data);
    } catch (err) {
      alert("AI failed");
    }

    setLoading(false);
  };

  const saveToAccounting = () => {
    if (!result?.items) return;

    const existing =
      JSON.parse(localStorage.getItem("expenses") || "[]");

    const newEntries = result.items.map((item) => ({
      vendor: result.vendor,
      date: result.date,
      total: item.price,
      account: item.account || "Unassigned",
      name: item.name,
      created_at: new Date().toISOString(),
    }));

    localStorage.setItem(
      "expenses",
      JSON.stringify([...newEntries, ...existing])
    );

    alert("Saved ✅");
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
            onClick={analyzeInvoice}
            className="bg-[#ff7a00] px-6 py-2 rounded"
          >
            {loading ? "Analyzing..." : "Analyze Invoice"}
          </button>

        </div>

        {result && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

            <div>Vendor: {result.vendor || "-"}</div>
            <div>Date: {result.date || "-"}</div>
            <div>Total: {result.total || 0} THB</div>

            {result.items?.map((item, i) => (
              <div key={i} className="bg-white/5 p-4 rounded space-y-2">

                <div className="flex justify-between">
                  <span>{item.name}</span>
                  <span>{item.price} THB</span>
                </div>

                <select
                  value={item.account || ""}
                  onChange={(e) => {
                    const updated = [...result.items];
                    updated[i].account = e.target.value;
                    setResult({ ...result, items: updated });
                  }}
                  className="w-full p-2 bg-black/40 rounded"
                >
                  <option value="">-- Select Account --</option>
                  {accounts.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>

              </div>
            ))}

            <button
              onClick={saveToAccounting}
              className="bg-green-600 px-6 py-2 rounded"
            >
              Save
            </button>

          </div>
        )}

      </div>
    </AppShell>
  );
}