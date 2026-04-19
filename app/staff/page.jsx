"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function StaffInvoices() {
  const [preview, setPreview] = useState(null);
  const [note, setNote] = useState("");
  const [staffName, setStaffName] = useState("Unknown");

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
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = () => {
    if (!preview) {
      alert("Upload image first");
      return;
    }

    const existing = JSON.parse(localStorage.getItem("pending_invoices") || "[]");

    const newInvoice = {
      id: Date.now(),
      staff: staffName,
      note,
      image: preview,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    localStorage.setItem(
      "pending_invoices",
      JSON.stringify([newInvoice, ...existing])
    );

    alert("Invoice sent to accounting ✅");

    setPreview(null);
    setNote("");
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Invoice AI</h1>

        <div className="card space-y-4">

          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
          />

          {preview && (
            <img src={preview} className="rounded-xl max-h-64" />
          )}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What is this for?"
            className="w-full p-2 bg-black/40 rounded"
          />

          <button
            onClick={handleAnalyze}
            className="bg-[#ff7a00] px-4 py-2 rounded"
          >
            Analyze Invoice
          </button>

        </div>

      </div>
    </AppShell>
  );
}