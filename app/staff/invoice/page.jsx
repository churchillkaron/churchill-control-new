"use client";

import { useState } from "react";
import AppShell from "../../AppShell";

export default function StaffInvoices() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [note, setNote] = useState("");

  // 🔥 Replace later with real logged-in user
  const staffName = "Staff User";

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

  const handleSubmit = () => {
    if (!preview) return;

    const existing =
      JSON.parse(localStorage.getItem("pending_invoices") || "[]");

    const newInvoice = {
      id: Date.now(),
      staff: staffName,
      note,
      image: preview,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    const updated = [newInvoice, ...existing];

    localStorage.setItem("pending_invoices", JSON.stringify(updated));

    // reset
    setFile(null);
    setPreview(null);
    setNote("");

    alert("Invoice submitted to accounting ✅");
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Submit Expense</h1>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            className="w-full"
          />

          {preview && (
            <img
              src={preview}
              alt="preview"
              className="rounded-xl max-h-64"
            />
          )}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What is this expense for?"
            className="w-full px-4 py-2 bg-black/40 rounded text-white"
          />

          <button
            onClick={handleSubmit}
            className="bg-[#ff7a00] px-4 py-2 rounded"
          >
            Submit to Accounting
          </button>

        </div>

      </div>
    </AppShell>
  );
}