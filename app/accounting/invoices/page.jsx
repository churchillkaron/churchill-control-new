"use client";

import { useState, useEffect } from "react";

export default function InvoicesPage() {
  const [image, setImage] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState([]);

  useEffect(() => {
    const stored = localStorage.getItem("invoices");
    if (stored) setSaved(JSON.parse(stored));
  }, []);

  const handleAnalyze = async () => {
    const res = await fetch("/api/invoice", {
      method: "POST",
      body: JSON.stringify({ image }),
      headers: { "Content-Type": "application/json" },
    });

    const data = await res.json();
    setResult(data);
  };

  const handleApprove = () => {
    if (!result) return;

    const updated = [...saved, result];
    setSaved(updated);
    localStorage.setItem("invoices", JSON.stringify(updated));

    setResult(null);
    setImage("");
  };

  // 🔥 NEW: summary calculation
  const summary = saved.reduce(
    (acc, inv) => {
      inv.items.forEach((item) => {
        acc.total += item.amount;

        if (item.account_type === "COGS") acc.cogs += item.amount;
        if (item.account_type === "Operating Expense")
          acc.opex += item.amount;
        if (item.account_type === "Owner / Non-Operating")
          acc.owner += item.amount;
      });

      return acc;
    },
    { total: 0, cogs: 0, opex: 0, owner: 0 }
  );

  return (
    <div style={{ padding: 20 }}>
      <h1>Invoice AI</h1>

      <input
        placeholder="Paste image URL or base64"
        value={image}
        onChange={(e) => setImage(e.target.value)}
        style={{ width: "100%", marginBottom: 10 }}
      />

      <button onClick={handleAnalyze}>Analyze</button>

      {result && (
        <div style={{ marginTop: 20 }}>
          <h3>AI Result</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
          <button onClick={handleApprove}>Approve & Save</button>
        </div>
      )}

      {/* 🔥 NEW: SUMMARY BLOCK */}
      <div style={{ marginTop: 40 }}>
        <h2>Summary</h2>
        <p>Total Spend: {summary.total} THB</p>
        <p>COGS: {summary.cogs} THB</p>
        <p>Operating Expense: {summary.opex} THB</p>
        <p>Owner: {summary.owner} THB</p>
      </div>

      <div style={{ marginTop: 40 }}>
        <h2>Saved Invoices</h2>
        <pre>{JSON.stringify(saved, null, 2)}</pre>
      </div>
    </div>
  );
}