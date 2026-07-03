"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";

export default function JournalsPage() {
  const { organizationId, entityId, financeGet, loading: runtimeLoading } =
    useFinanceRuntime();

  const [data, setData] = useState({ journals: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (runtimeLoading || !organizationId || !entityId) return;

    setLoading(true);

    financeGet("/api/finance/journals")
      .then(setData)
      .catch(error =>
        setData({
          success: false,
          error: error.message,
          journals: [],
        })
      )
      .finally(() => setLoading(false));
  }, [runtimeLoading, organizationId, entityId]);

  const journals = data?.journals || [];

  return (
    <main className="min-h-screen p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <p className="tracking-[0.35em] text-xs text-white/40">FINANCE</p>
        <h1 className="mt-3 text-4xl font-light">Journals</h1>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          {loading ? (
            <div className="text-white/60">Loading journals...</div>
          ) : !data?.success ? (
            <div className="text-red-300">{data?.error || "Failed to load journals."}</div>
          ) : journals.length === 0 ? (
            <div className="text-white/60">No journals posted for this entity yet.</div>
          ) : (
            <div className="space-y-4">
              {journals.map(journal => (
                <div key={journal.id} className="rounded-xl border border-white/10 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-lg">{journal.entry_number}</div>
                      <div className="text-sm text-white/50">{journal.description}</div>
                    </div>
                    <div className="text-right text-sm text-white/60">
                      <div>{journal.posting_date || journal.entry_date}</div>
                      <div>{journal.status}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
