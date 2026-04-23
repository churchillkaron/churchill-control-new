"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function AIInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const res = await fetch("/api/invoices");
      const data = await res.json();
      setInvoices(data || []);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  // 🔥 APPROVE
  const approveInvoice = async (id) => {
    await fetch("/api/invoices/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id,
        status: "approved_manager",
      }),
    });

    fetchInvoices();
  };

  // 🔥 REJECT
  const rejectInvoice = async (id) => {
    await fetch("/api/invoices/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id,
        status: "rejected",
      }),
    });

    fetchInvoices();
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">AI Invoices</h1>

        {loading && <div className="text-white/50">Loading...</div>}

        {!loading && invoices.length === 0 && (
          <div className="text-white/40">No invoices yet</div>
        )}

        {!loading &&
          invoices.map((inv) => (
            <div
              key={inv.id}
              className="bg-white/5 border border-white/10 rounded-xl p-4 flex justify-between items-center"
            >
              <div>
                <div className="text-lg">{inv.vendor}</div>
                <div className="text-sm text-white/50">
                  {inv.category} ({inv.department})
                </div>
                <div className="text-xs text-white/40">
                  Confidence: {inv.confidence}
                </div>
                <div className="text-xs text-white/40">
                  Status: {inv.status}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-lg">{inv.amount} THB</div>

                {inv.status === "pending_approval" && (
                  <>
                    <button
                      onClick={() => approveInvoice(inv.id)}
                      className="bg-green-500 px-3 py-1 rounded text-sm"
                    >
                      Approve
                    </button>

                    <button
                      onClick={() => rejectInvoice(inv.id)}
                      className="bg-red-500 px-3 py-1 rounded text-sm"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

      </div>
    </AppShell>
  );
}
