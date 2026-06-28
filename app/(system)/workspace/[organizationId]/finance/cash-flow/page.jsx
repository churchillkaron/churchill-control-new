"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import FinanceEntityScope from "@/components/finance/FinanceEntityScope";
import { financeQuery, resolveFinanceScope } from "@/components/finance/financeScope";

export default function Page() {
  const params = useParams();
  const searchParams = useSearchParams();

  const organizationId = params.organizationId;
  const { entityId } = resolveFinanceScope({
    organizationId,
    searchParams,
  });

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  const endpoints = [{"label":"Cash Flow","url":"/api/finance/cash-flow"},{"label":"Run Cash Flow Engine","url":"/api/finance/cash-flow/run"},{"label":"Liquidity","url":"/api/finance/treasury/liquidity"}];

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const query = financeQuery({
          organizationId,
          entityId,
        });

        const loaded = await Promise.all(
          endpoints.map(async (item) => {
            const res = await fetch(`${item.url}?${query}`, {
              cache: "no-store",
            });

            const json = await res.json().catch(() => ({}));

            return {
              label: item.label,
              url: item.url,
              ok: res.ok && json.success !== false,
              status: res.status,
              data: json,
            };
          })
        );

        if (mounted) {
          setResults(loaded);
        }
      } catch (err) {
        if (mounted) {
          setError(err?.message || "Failed to load finance runtime");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [organizationId, entityId]);

  return (
    <main className="space-y-6 p-6 text-white">
      <div>
        <div className="text-xs uppercase tracking-[0.35em] text-white/40">
          Finance
        </div>
        <h1 className="mt-2 text-3xl font-bold">Cash Flow</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/55">
          Cash flow and liquidity visibility by organization and legal entity.
        </p>
      </div>

      <FinanceEntityScope organizationId={organizationId} />

      {loading && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/50">
          Loading finance data...
        </div>
      )}

      {error && (
        <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-4 xl:grid-cols-2">
          {results.map((result) => (
            <section
              key={result.url}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">{result.label}</div>
                  <div className="mt-1 text-xs text-white/35">{result.url}</div>
                </div>

                <div
                  className={
                    result.ok
                      ? "rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200"
                      : "rounded-full bg-red-400/15 px-3 py-1 text-xs font-semibold text-red-200"
                  }
                >
                  {result.ok ? "LIVE" : "CHECK"}
                </div>
              </div>

              <pre className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs text-white/65">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

