"use client";

import { useState, useEffect } from "react";

export default function InvoicesPage() {
  const [image, setImage] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState([]);
  const [accountingFeed, setAccountingFeed] = useState([]);

  useEffect(() => {
    const stored = localStorage.getItem("invoices");
    if (stored) setSaved(JSON.parse(stored));
  }, []);

  // 🔥 BUILD ACCOUNTING FEED
  useEffect(() => {
    const feed = saved.flatMap((inv) =>
      inv.items.map((item) => ({
        vendor: inv.vendor,
        date: inv.invoice_date,
        amount: item.amount,
        account_type: item.account_type,
        department: item.department,
        natural_account: item.natural_account,
      }))
    );

    setAccountingFeed(feed);
    localStorage.setItem("accounting_feed", JSON.stringify(feed));
  }, [saved]);

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
    localStorage.removeItem("accounting_feed");
  };

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

      {/* 🔥 NEW: ACCOUNTING FEED VIEW */}
      <div style={{ marginTop: 40 }}>
        <h2>Accounting Feed (Structured)</h2>
        <pre>{JSON.stringify(accountingFeed, null, 2)}</pre>
      </div>
    </div>
  );
}