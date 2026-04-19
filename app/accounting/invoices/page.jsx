"use client";

import { useState } from "react";
import AppShell from "../../AppShell";

export default function InvoiceAI() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

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

    try {
      const res = await fetch("/api/invoice-ai", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      alert("AI failed");
    }

    setLoading(false);
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Invoice AI</h1>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">

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

        {/* RESULT UI */}
        {result && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

            <h2 className="text-xl">AI Result</h2>

            <div className="space-y-2 text-white/80">

              <div><b>Vendor:</b> {result.vendor}</div>
              <div><b>Date:</b> {result.date}</div>
              <div><b>Total:</b> {result.total} THB</div>

            </div>

            <div className="mt-4">
              <div className="mb-2 text-white/60">Items:</div>

              <div className="space-y-2">
                {result.items?.map((item, i) => (
                  <div
                    key={i}
                    className="flex justify-between bg-white/5 p-3 rounded-lg"
                  >
                    <span>{item.name}</span>
                    <span>{item.price} THB</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </AppShell>
  );
}