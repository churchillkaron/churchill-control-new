"use client";

import { useState } from "react";
import AppShell from "../../AppShell";

export default function InvoicesPage() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
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
    if (!preview) return;

    const res = await fetch("/api/invoice", {
      method: "POST",
      body: JSON.stringify({ image: preview }),
      headers: { "Content-Type": "application/json" },
    });

    const data = await res.json();
    setResult(data);
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Invoice AI</h1>

        {/* UPLOAD */}
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

          <button
            onClick={handleAnalyze}
            className="bg-[#ff7a00] px-4 py-2 rounded"
          >
            Analyze Invoice
          </button>

        </div>

        {/* RESULT */}
        {result && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="mb-2">AI Result</h3>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

      </div>
    </AppShell>
  );
}