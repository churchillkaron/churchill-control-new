"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function AccountingInvoicesPage() {
  const [pending, setPending] = useState([]);
  const [selected, setSelected] = useState(null);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    loadPending();
  }, []);

  const loadPending = () => {
    const stored = JSON.parse(localStorage.getItem("pending_invoices") || "[]");
    setPending(stored);
  };

  const handleSelect = (invoice) => {
    setSelected(invoice);
    setAnalysis(null);
  };

  const handleAnalyze = async (invoice) => {
    setAnalyzingId(invoice.id);
    setSelected(invoice);
    setAnalysis(null);

    try {
      const res = await fetch("/api/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: invoice.image }),
      });

      const data = await res.json();

      const enriched = {
        ...data,
        submitted_by: invoice.staff,
        submitted_note: invoice.note || "",
        submitted_at: invoice.created_at,
        source_invoice_id: invoice.id,
        source_image: invoice.image,
      };

      setAnalysis(enriched);
    } catch (error) {
      setAnalysis({ error: "AI analysis failed" });
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleApprove = () => {
    if (!selected || !analysis || analysis.error) return;

    const existingFeed = JSON.parse(localStorage.getItem("accounting_feed") || "[]");

    const feedRows = (analysis.items || []).map((item) => ({
      vendor: analysis.vendor || "Unknown Vendor",
      date: analysis.invoice_date || null,
      amount: Number(item.amount) || 0,
      account_type: item.account_type || "Operating Expense",
      department: item.department || "Operations",
      natural_account: item.natural_account || "Miscellaneous",
      submitted_by: analysis.submitted_by || "",
      submitted_note: analysis.submitted_note || "",
      source_invoice_id: analysis.source_invoice_id,
      approved_at: new Date().toISOString(),
    }));

    const updatedFeed = [...feedRows, ...existingFeed];
    localStorage.setItem("accounting_feed", JSON.stringify(updatedFeed));

    const updatedPending = pending.filter((item) => item.id !== selected.id);
    localStorage.setItem("pending_invoices", JSON.stringify(updatedPending));

    setPending(updatedPending);
    setSelected(null);
    setAnalysis(null);
  };

  const handleReject = (invoiceId) => {
    const updatedPending = pending.filter((item) => item.id !== invoiceId);
    localStorage.setItem("pending_invoices", JSON.stringify(updatedPending));

    setPending(updatedPending);

    if (selected?.id === invoiceId) {
      setSelected(null);
      setAnalysis(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">
        <h1 className="text-3xl">Accounting Invoice Approval</h1>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* LEFT: PENDING LIST */}
          <div className="space-y-4">
            <h2 className="text-xl">Pending Staff Submissions</h2>

            {pending.length === 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/50">
                No pending invoices
              </div>
            )}

            {pending.map((invoice) => (
              <div
                key={invoice.id}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3"
              >
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <div className="font-semibold">{invoice.staff}</div>
                    <div className="text-sm text-white/50">
                      {invoice.note || "No note"}
                    </div>
                  </div>

                  <div className="text-xs text-white/40">
                    {new Date(invoice.created_at).toLocaleString()}
                  </div>
                </div>

                {invoice.image && (
                  <img
                    src={invoice.image}
                    alt="invoice"
                    className="rounded-xl max-h-48 border border-white/10"
                  />
                )}

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => handleSelect(invoice)}
                    className="bg-white/10 px-4 py-2 rounded"
                  >
                    View
                  </button>

                  <button
                    onClick={() => handleAnalyze(invoice)}
                    className="bg-[#ff7a00] px-4 py-2 rounded"
                  >
                    {analyzingId === invoice.id ? "Analyzing..." : "Analyze AI"}
                  </button>

                  <button
                    onClick={() => handleReject(invoice.id)}
                    className="bg-red-500/80 px-4 py-2 rounded"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* RIGHT: REVIEW PANEL */}
          <div className="space-y-4">
            <h2 className="text-xl">Review Panel</h2>

            {!selected && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/50">
                Select a pending invoice
              </div>
            )}

            {selected && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                <div>
                  <div className="text-sm text-white/50">Submitted by</div>
                  <div>{selected.staff}</div>
                </div>

                <div>
                  <div className="text-sm text-white/50">Note</div>
                  <div>{selected.note || "No note"}</div>
                </div>

                {selected.image && (
                  <img
                    src={selected.image}
                    alt="selected invoice"
                    className="rounded-xl max-h-72 border border-white/10"
                  />
                )}

                {analysis && !analysis.error && (
                  <div className="space-y-4">
                    <div className="border-t border-white/10 pt-4">
                      <div className="text-sm text-white/50">Vendor</div>
                      <div>{analysis.vendor || "Unknown Vendor"}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-white/50">Invoice Date</div>
                        <div>{analysis.invoice_date || "-"}</div>
                      </div>
                      <div>
                        <div className="text-sm text-white/50">Total</div>
                        <div>
                          {analysis.currency || "THB"} {Number(analysis.total || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-sm text-white/50 mb-2">Items</div>
                      <div className="space-y-2">
                        {(analysis.items || []).map((item, index) => (
                          <div
                            key={index}
                            className="bg-black/20 border border-white/10 rounded-xl p-3 text-sm"
                          >
                            <div className="font-medium">{item.name}</div>
                            <div className="text-white/60">
                              {item.account_type} / {item.department} / {item.natural_account}
                            </div>
                            <div className="text-[#ffb36b]">
                              THB {Number(item.amount || 0).toLocaleString()}
                            </div>
                            {item.notes && (
                              <div className="text-white/40 mt-1">{item.notes}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleApprove}
                        className="bg-green-500 px-4 py-2 rounded"
                      >
                        Approve to Accounting
                      </button>

                      <button
                        onClick={() => handleReject(selected.id)}
                        className="bg-red-500/80 px-4 py-2 rounded"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}

                {analysis?.error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300">
                    {analysis.error}
                  </div>
                )}

                {!analysis && (
                  <div className="text-white/50">
                    Run AI analysis to review this invoice.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
