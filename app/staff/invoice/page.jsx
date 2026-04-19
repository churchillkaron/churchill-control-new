"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function StaffInvoices() {
  const [preview, setPreview] = useState(null);
  const [note, setNote] = useState("");
  const [staffName, setStaffName] = useState("Unknown");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("current_user") || "null");
    if (user?.name) setStaffName(user.name);
  }, []);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
      setResult(null);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const analyzeInvoice = async () => {
    if (!preview) {
      setError("Please choose an invoice image first.");
      return;
    }

    setAnalyzing(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/invoice-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: preview }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Invoice analysis failed.");
        setAnalyzing(false);
        return;
      }

      setResult(data);
    } catch (err) {
      setError("Connection error while analyzing invoice.");
    }

    setAnalyzing(false);
  };

  const handleSubmit = () => {
    if (!preview) {
      setError("Please choose an invoice image first.");
      return;
    }

    const existing = JSON.parse(localStorage.getItem("pending_invoices") || "[]");

    const newInvoice = {
      id: Date.now(),
      staff: staffName,
      note,
      image: preview,
      ai: result,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    localStorage.setItem(
      "pending_invoices",
      JSON.stringify([newInvoice, ...existing])
    );

    setPreview(null);
    setNote("");
    setResult(null);
    setError("");

    alert("Invoice sent to accounting ✅");
  };

  return (
    <AppShell>
      <div className="space-y-8 text-white">
        <h1 className="text-3xl">Invoice AI</h1>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
          />

          {preview && (
            <img
              src={preview}
              alt="Invoice preview"
              className="rounded-xl max-h-72 border border-white/10"
            />
          )}

          <div className="flex gap-3">
            <button
              onClick={analyzeInvoice}
              disabled={analyzing}
              className="bg-[#ff7a00] px-4 py-2 rounded-xl disabled:opacity-50"
            >
              {analyzing ? "Analyzing..." : "Analyze Invoice"}
            </button>

            <button
              onClick={handleSubmit}
              className="bg-white/10 px-4 py-2 rounded-xl"
            >
              Submit
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl p-4">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="bg-black/30 border border-white/10 rounded-xl p-4 grid md:grid-cols-4 gap-4">
                <div>
                  <div className="text-white/40 text-xs uppercase tracking-wide">Vendor</div>
                  <div className="mt-1">{result.vendor || "-"}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs uppercase tracking-wide">Date</div>
                  <div className="mt-1">{result.invoice_date || "-"}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs uppercase tracking-wide">Currency</div>
                  <div className="mt-1">{result.currency || "THB"}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs uppercase tracking-wide">Total</div>
                  <div className="mt-1">{result.total ?? 0}</div>
                </div>
              </div>

              <div className="bg-black/30 border border-white/10 rounded-xl p-4">
                <div className="text-lg mb-4">Line Items</div>

                <div className="space-y-3">
                  {Array.isArray(result.items) && result.items.length > 0 ? (
                    result.items.map((item, index) => (
                      <div
                        key={index}
                        className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2"
                      >
                        <div className="flex justify-between gap-4">
                          <div className="font-medium">{item.name || "Unknown Item"}</div>
                          <div className="text-[#ff7a00]">{item.amount ?? 0} {result.currency || "THB"}</div>
                        </div>

                        <div className="grid md:grid-cols-4 gap-3 text-sm text-white/70">
                          <div>
                            <span className="text-white/40">Qty:</span> {item.qty ?? 1}
                          </div>
                          <div>
                            <span className="text-white/40">Type:</span> {item.account_type || "-"}
                          </div>
                          <div>
                            <span className="text-white/40">Department:</span> {item.department || "-"}
                          </div>
                          <div>
                            <span className="text-white/40">Natural:</span> {item.natural_account || "-"}
                          </div>
                        </div>

                        {(item.tag || item.notes) && (
                          <div className="text-sm text-white/60">
                            {item.tag && <div><span className="text-white/40">Tag:</span> {item.tag}</div>}
                            {item.notes && <div><span className="text-white/40">Notes:</span> {item.notes}</div>}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-white/50">No items returned.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What is this expense for?"
            className="w-full px-4 py-3 bg-black/40 rounded-xl border border-white/10"
          />
        </div>
      </div>
    </AppShell>
  );
}