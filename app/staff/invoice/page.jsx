"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function StaffInvoices() {
  const [preview, setPreview] = useState(null);
  const [note, setNote] = useState("");
  const [staffName, setStaffName] = useState("Unknown");

  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);

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
    };
    reader.readAsDataURL(file);
  };

  const analyzeInvoice = async () => {
    if (!preview) return;

    setAnalyzing(true);

    setTimeout(() => {
      setResult({
        total: "320 THB",
        vendor: "Supplier",
        date: new Date().toLocaleDateString(),
      });
      setAnalyzing(false);
    }, 1200);
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

          {result && (
            <div className="bg-black/40 p-4 rounded-xl text-sm space-y-1">
              <div>💰 Total: {result.total}</div>
              <div>🏪 Vendor: {result.vendor}</div>
              <div>📅 Date: {result.date}</div>
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