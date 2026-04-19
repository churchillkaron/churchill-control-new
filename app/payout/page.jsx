"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function StaffInvoices() {
  const [preview, setPreview] = useState(null);
  const [note, setNote] = useState("");
  const [staffName, setStaffName] = useState("Unknown");

  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("current_user"));
    if (user?.name) setStaffName(user.name);
  }, []);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
      setResult(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  // 🔥 REAL AI CALL
  const analyzeInvoice = async () => {
    if (!preview) return;

    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch("/api/invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: preview }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "AI failed");
        setAnalyzing(false);
        return;
      }

      setResult(data);
    } catch (err) {
      setError("Connection error");
    }

    setAnalyzing(false);
  };

  const handleSubmit = () => {
    if (!preview) return;

    const existing =
      JSON.parse(localStorage.getItem("pending_invoices") || "[]");

    const newInvoice = {
      id: Date.now(),
      staff: staffName,
      note,
      image: preview,
      ai: result,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    const updated = [newInvoice, ...existing];

    localStorage.setItem("pending_invoices", JSON.stringify(updated));

    setPreview(null);
    setNote("");
    setResult(null);

    alert("Invoice sent to accounting ✅");
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Submit Invoice</h1>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
          />

          {preview && (
            <img src={preview} className="rounded-xl max-h-64" />
          )}

          {preview && !result && (
            <button
              onClick={analyzeInvoice}
              className="bg-blue-500 px-4 py-2 rounded w-full"
            >
              {analyzing ? "Analyzing..." : "Analyze Invoice"}
            </button>
          )}

          {error && (
            <div className="text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* 🔥 FULL AI OUTPUT */}
          {result && (
            <div className="bg-black/40 p-4 rounded-xl text-sm space-y-2">

              <div>🏪 {result.vendor}</div>
              <div>📅 {result.invoice_date || "No date"}</div>
              <div>💰 {result.total} {result.currency}</div>

              <div className="pt-2 border-t border-white/10">
                {result.items.map((item, i) => (
                  <div key={i} className="text-white/70">
                    • {item.name} — {item.amount} THB  
                    <div className="text-white/40 text-xs">
                      {item.account_type} / {item.department} / {item.natural_account}
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What is this expense for?"
            className="w-full px-4 py-2 bg-black/40 rounded"
          />

          <button
            onClick={handleSubmit}
            className="bg-[#ff7a00] px-4 py-2 rounded w-full"
          >
            Submit
          </button>

        </div>

      </div>
    </AppShell>
  );
}