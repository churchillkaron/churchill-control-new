"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";

export default function TrialBalancePage() {
  const { organizationId, entityId, financeGet, loading: runtimeLoading } =
    useFinanceRuntime();

  const [data, setData] = useState({ rows: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (runtimeLoading || !organizationId || !entityId) return;

    setLoading(true);

    financeGet("/api/finance/trial-balance")
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
        <h1 className="mt-3 text-4xl font-light">Trial Balance</h1>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Total Debits" value={data?.totalDebits || 0} />
          <Card title="Total Credits" value={data?.totalCredits || 0} />
          <Card title="Balanced" value={data?.balanced ? "Yes" : "No"} />
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          {loading ? (
            <div className="text-white/60">Loading trial balance...</div>
          ) : !data?.success ? (
            <div className="text-red-300">{data?.error || "Failed to load trial balance."}</div>
          ) : rows.length === 0 ? (
            <div className="text-white/60">No trial balance rows for this entity yet.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-white/50">
                  <tr>
                    <th className="py-3">Code</th>
                    <th>Account</th>
                    <th>Category</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.account_id} className="border-t border-white/10">
                      <td className="py-3">{row.code}</td>
                      <td>{row.name}</td>
                      <td>{row.category}</td>
                      <td className="text-right">{Number(row.total_debits || 0).toLocaleString()}</td>
                      <td className="text-right">{Number(row.total_credits || 0).toLocaleString()}</td>
                      <td className="text-right">{Number(row.balance || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Card({ title, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="text-sm text-white/50">{title}</div>
      <div className="mt-3 text-2xl font-light">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
