"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";

function label(value) {
  return String(value || "").trim().replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function shortDate(value) {
  return value ? String(value).slice(0, 10) : "—";
}

export default function FinanceReviewFreshnessExceptionsRail({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", body: null });

  async function load() {
    if (!organizationId) return;
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/workspace/finance/review-freshness-exceptions", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to evaluate signed-review freshness");
      setState({ loading: false, error: "", body });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Unable to evaluate signed-review freshness", body: null });
    }
  }

  useEffect(() => { load(); }, [organizationId]);

  if (!organizationId) return null;
  const exceptions = Array.isArray(state.body?.exceptions) ? state.body.exceptions : [];

  if (!state.loading && !state.error && !exceptions.length) return null;

  return (
    <section className="mx-auto mt-3 max-w-[1760px] overflow-hidden rounded-xl border border-black/[0.07] bg-white shadow-[0_6px_24px_rgba(35,31,27,0.025)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.06] px-4 py-3.5 sm:px-5">
        <div>
          <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8A633C]"><ShieldCheck size={10} /> Signed review freshness</div>
          <div className="mt-1 text-[10px] font-medium text-[#3E3933]">Previously reviewed work that changed after sign-off</div>
          <div className="mt-0.5 text-[8px] leading-4 text-[#8B857D]">Only evidence-bound changes appear here. Unrelated edits do not reopen review. Partner clearance stays blocked until stale evidence is re-reviewed.</div>
        </div>
        <button type="button" onClick={load} disabled={state.loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.07] bg-[#FCFBF9] px-2.5 text-[7px] font-semibold text-[#716B63] disabled:opacity-50"><RefreshCw size={9} className={state.loading ? "animate-spin" : ""} /> Refresh</button>
      </div>

      {state.loading && !state.body ? <div className="px-4 py-4 text-[8px] text-[#8B857D] sm:px-5">Checking current accounting evidence against signed reviews…</div> : null}
      {state.error ? <div className="m-3 rounded-lg border border-red-700/12 bg-red-50 px-3 py-2.5 text-[8px] text-red-800"><b>Freshness control unavailable.</b> {state.error}. Avantiqo does not treat signed reviews as current while this control is unavailable.</div> : null}

      {exceptions.length ? (
        <div className="divide-y divide-black/[0.05]">
          {exceptions.slice(0, 50).map((row) => (
            <div key={`${row.run_id}:${row.work_item_id}`} className="grid gap-2 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(180px,1.1fr)_minmax(220px,1.5fr)_minmax(220px,1.4fr)_120px] lg:items-center">
              <div className="min-w-0">
                <div className="truncate text-[9px] font-semibold text-[#3F3A34]">{row.client_name}</div>
                <div className="mt-0.5 text-[7px] text-[#989188]">Reviewer: {row.reviewer_name || "Unassigned"} · signed {shortDate(row.signed_at)}</div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-[8px] font-semibold text-[#514B45]">{row.title}</div>
                <div className="mt-0.5 text-[7px] text-[#8F8981]">{row.reason}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {(row.changed_labels || []).length ? row.changed_labels.slice(0, 4).map((item) => <span key={item} className="rounded-full border border-red-700/10 bg-red-50 px-2 py-1 text-[6px] font-semibold text-red-800">{item}</span>) : <span className="rounded-full border border-amber-700/10 bg-amber-50 px-2 py-1 text-[6px] font-semibold text-amber-800">Freshness must be re-established</span>}
              </div>
              <div className="flex items-center justify-between gap-2 lg:justify-end">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[6px] font-semibold uppercase ${row.freshness_state === "STALE" ? "border-red-700/12 bg-red-50 text-red-800" : "border-amber-700/12 bg-amber-50 text-amber-800"}`}><AlertTriangle size={7} /> {label(row.freshness_state)}</span>
                <Link href={row.review_href || `/workspace/${organizationId}/finance/review`} className="text-[7px] font-semibold text-[#76583A]">Open review →</Link>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {state.body?.integrity?.complete === false ? <div className="border-t border-red-700/10 bg-red-50 px-4 py-2 text-[7px] text-red-800 sm:px-5">Freshness population completeness was not proven. No all-clear state is shown.</div> : null}
    </section>
  );
}
