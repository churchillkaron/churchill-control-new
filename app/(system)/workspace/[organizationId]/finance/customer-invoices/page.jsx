"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

function value(row, keys, fallback = "-") {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
  }
  return fallback;
}

function money(input) {
  const n = Number(input || 0);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export default function FinanceListPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const organizationId =
    params?.organizationId ||
    searchParams.get("organizationId") ||
    searchParams.get("organization_id");

  const [state, setState] = useState({
    loading: true,
    success: true,
    rows: [],
    warning: null,
    error: null,
  });

  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!organizationId) {
        setState({
          loading: false,
          success: false,
          rows: [],
          warning: null,
          error: "organizationId unavailable",
        });
        return;
      }

      setState(prev => ({ ...prev, loading: true }));

      try {
        const url = new URL("/api/finance/customer-invoices", window.location.origin);
        url.searchParams.set("organizationId", organizationId);

        const res = await fetch(url.toString(), { cache: "no-store" });
        const data = await res.json();

        if (cancelled) return;

        setState({
          loading: false,
          success: data?.success !== false,
          rows: data?.["invoices"] || [],
          warning: data?.warning || null,
          error: data?.error || null,
        });
      } catch (error) {
        if (cancelled) return;

        setState({
          loading: false,
          success: false,
          rows: [],
          warning: null,
          error: error.message,
        });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.rows;
    return state.rows.filter(row => JSON.stringify(row).toLowerCase().includes(q));
  }, [state.rows, query]);

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs tracking-[0.35em] text-white/40">{"ACCOUNTS RECEIVABLE"}</p>

        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-light">{"Customer Invoices"}</h1>
            <p className="mt-2 text-sm text-white/50">{"Dynamic customer invoice data from finance AR."}</p>
          </div>

          <button className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black">
            {"+ New Invoice"}
          </button>
        </div>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={"Search invoices..."}
            className="mb-5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none placeholder:text-white/30"
          />

          {state.loading ? (
            <div className="text-white/60">{"Loading customer invoices..."}</div>
          ) : !state.success ? (
            <div className="text-red-300">{state.error || "Failed to load."}</div>
          ) : state.warning ? (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-amber-200">
              {state.warning}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-white/50">
              {"No customer invoices found."}
            </div>
          ) : (
            <div className="overflow-auto">
              {(
                <table className="w-full text-left text-sm">
                  <thead className="text-white/50">
                    <tr>
                      <th className="py-3">Invoice</th>
                      <th>Customer</th>
                      <th>Date</th>
                      <th>Due</th>
                      <th>Total</th>
                      <th>Outstanding</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.id} className="border-t border-white/10">
                        <td className="py-3">{value(row, ["invoice_number", "number", "document_number"])}</td>
                        <td>{value(row, ["customer_name", "customer", "customer_id"])}</td>
                        <td>{value(row, ["invoice_date", "date", "created_at"])}</td>
                        <td>{value(row, ["due_date"])}</td>
                        <td>{money(value(row, ["total", "total_amount", "amount"], 0))}</td>
                        <td>{money(value(row, ["outstanding", "outstanding_amount", "balance"], 0))}</td>
                        <td>{value(row, ["status"], "draft")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
