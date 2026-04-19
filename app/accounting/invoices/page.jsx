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

  const handleDelete = (index) => {
    const updated = saved.filter((_, i) => i !== index);
    setSaved(updated);
    localStorage.setItem("invoices", JSON.stringify(updated));
  };

  const handleReset = () => {
    setSaved([]);
    localStorage.removeItem("invoices");
  };

  // 🔥 SUMMARY
  const summary = saved.reduce(
    (acc, inv) => {
      inv.items.forEach((item) => {
        acc.total += item.amount;

        if (item.account_type === "COGS") acc.cogs += item.amount;
        if (item.account_type === "Operating Expense") acc.opex += item.amount;
        if (item.account_type === "Owner / Non-Operating") acc.owner += item.amount;

        // 🔥 NEW: department breakdown
        acc.departments[item.department] =
          (acc.departments[item.department] || 0) + item.amount;
      });

      return acc;
    },
    { total: 0, cogs: 0, opex: 0, owner: 0, departments: {} }
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

      <div style={{ marginTop: 40 }}>
        <h2>Summary</h2>
        <p>Total: {summary.total} THB</p>
        <p>COGS: {summary.cogs}</p>
        <p>OPEX: {summary.opex}</p>
        <p>Owner: {summary.owner}</p>
      </div>

      {/* 🔥 NEW: DEPARTMENT VIEW */}
      <div style={{ marginTop: 40 }}>
        <h2>Department Breakdown</h2>
        {Object.entries(summary.departments).map(([dept, amount]) => (
          <div key={dept}>
            {dept}: {amount} THB
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40 }}>
        <h2>Saved Invoices</h2>

        <button onClick={handleReset} style={{ marginBottom: 10 }}>
          Reset All
        </button>

        {saved.map((inv, index) => (
          <div key={index} style={{ marginBottom: 20, border: "1px solid #ccc", padding: 10 }}>
            <strong>{inv.vendor}</strong> — {inv.total} THB
            <br />
            <button onClick={() => handleDelete(index)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}