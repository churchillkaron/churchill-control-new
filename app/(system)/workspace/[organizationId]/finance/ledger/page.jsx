"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";

export default function LedgerPage() {
  const { organizationId, entityId, financeGet, loading: runtimeLoading } =
    useFinanceRuntime();

  const [data, setData] = useState({ rows: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (runtimeLoading || !organizationId || !entityId) return;

    setLoading(true);

    financeGet("/api/finance/general-ledger")
      .then(setData)
      .catch(error =>
        setData({
          success: false,
          error: error.message,
          rows: [],
        })
      )
      .finally(() => setLoading(false));
  }, [runtimeLoading, organizationId, entityId]);

  const rows = data?.rows || [];

  return (
    <main className="min-h-screen p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <p className="tracking-[0.35em] text-xs text-white/40">FINANCE</p>
        <h1 className="mt-3 text-4xl font-light">General Ledger</h1>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          {loading ? (
            <div className="text-white/60">Loading ledger...</div>
          ) : !data?.success ? (
            <div className="text-red-300">{data?.error || "Failed to load ledger."}</div>
          ) : rows.length === 0 ? (
            <div className="text-white/60">No ledger entries posted for this entity yet.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-white/50">
                  <tr>
                    <th className="py-3">Date</th>
                    <th>Account</th>
                    <th>Description</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const account = Array.isArray(row.chart_of_accounts)
                      ? row.chart_of_accounts[0]
                      : row.chart_of_accounts;

                    return (
                      <tr key={row.id} className="border-t border-white/10">
                        <td className="py-3">{row.posting_date || row.transaction_date || "-"}</td>
                        <td>{account?.code || ""} {account?.name || row.account_name || ""}</td>
                        <td>{row.reference_type || row.entry_type || "-"}</td>
                        <td className="text-right">{Number(row.debit || 0).toLocaleString()}</td>
                        <td className="text-right">{Number(row.credit || 0).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
