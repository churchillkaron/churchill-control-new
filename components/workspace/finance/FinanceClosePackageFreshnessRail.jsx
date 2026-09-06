"use client";

import Link from "next/link";
import { AlertTriangle, BadgeCheck, FileClock, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function clean(value) {
  return String(value ?? "").trim();
}

function financeHref(organizationId, route) {
  return organizationId ? `/workspace/${organizationId}${route}` : "#";
}

function changedHref(organizationId, section) {
  const routes = {
    ledger: "/finance/books",
    journals: "/finance/books",
    close_steps: "/finance/close",
    reconciliations: "/finance/bank-reconciliation",
    tax_and_statutory: "/finance/vat-returns",
    close_adjustments: "/finance/close",
    review_and_approval: "/finance/review",
    period: "/finance/close",
  };
  return financeHref(organizationId, routes[section] || "/finance/close");
}

export default function FinanceClosePackageFreshnessRail({ organizationId, compact = false }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const [state, setState] = useState({ loading: false, error: "", data: null });

  async function load() {
    if (!organizationId || !entityId || !periodId) {
      setState({ loading: false, error: "", data: null });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const url = new URL("/api/workspace/finance/close-package-freshness", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      url.searchParams.set("periodId", periodId);
      const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        const error = new Error(body?.error || "Close-package freshness control unavailable");
        error.freshness = body?.details?.freshness || null;
        throw error;
      }
      setState({ loading: false, error: "", data: body });
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "Close-package freshness control unavailable",
        data: error?.freshness ? { freshness: error.freshness } : null,
      });
    }
  }

  useEffect(() => { load(); }, [organizationId, entityId, periodId]);

  if (!entityId || !periodId) return null;

  const freshness = state.data?.freshness || {};
  const freshnessState = clean(freshness.state).toUpperCase();
  const trusted = freshness.trusted === true;
  const changedSections = Array.isArray(freshness.changed_sections) ? freshness.changed_sections : [];
  const changedLabels = Array.isArray(freshness.changed_labels) ? freshness.changed_labels : [];
  const isDraft = freshnessState === "NOT_CLOSED";
  const isError = Boolean(state.error) || (!trusted && !isDraft && freshnessState !== "");

  if (state.loading && !state.data) {
    return (
      <section className="rounded-2xl border border-black/[0.07] bg-white px-4 py-3 text-[9px] text-[#817D76]">
        <div className="flex items-center gap-2"><LoaderCircle size={12} className="animate-spin text-[#A37849]" />Checking whether the accounting package still matches current truth…</div>
      </section>
    );
  }

  return (
    <section className={`rounded-[20px] border px-4 py-3.5 ${isError ? "border-red-700/15 bg-red-50" : trusted ? "border-emerald-700/12 bg-emerald-50/55" : "border-amber-700/15 bg-[#FFF9EF]"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {isError ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[#9A533D]" /> : trusted ? <BadgeCheck size={15} className="mt-0.5 shrink-0 text-[#62765E]" /> : <FileClock size={15} className="mt-0.5 shrink-0 text-[#A37849]" />}
          <div className="min-w-0">
            <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8A867F]">Accounting package freshness</div>
            <div className="mt-1 text-[13px] font-semibold tracking-[-0.02em] text-[#38332E]">
              {state.error
                ? "Freshness control unavailable — package not trusted"
                : trusted
                  ? "Close package still matches current accounting truth"
                  : isDraft
                    ? "Live draft — period is not closed"
                    : freshnessState === "STALE"
                      ? "Re-open the affected work before relying on this close"
                      : "Close package freshness is unproven"}
            </div>
            <div className="mt-1 max-w-5xl text-[9px] leading-4 text-[#756F67]">
              {state.error
                ? "Avantiqo could not completely re-read the accounting population. It will not present this package as current until the control succeeds."
                : freshness.reason || (isDraft ? "Reports are live views of current accounting data; they are not a signed final package yet." : "Freshness status unavailable.")}
            </div>
            {isError && changedLabels.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {changedLabels.map((label, index) => (
                  <Link key={`${label}:${index}`} href={changedHref(organizationId, changedSections[index])} className="rounded-full border border-red-700/10 bg-white/75 px-2 py-1 text-[7px] font-semibold text-[#8F5848] transition hover:border-red-700/25">
                    {label} →
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start">
          {!compact ? <span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] ${isError ? "border-red-700/15 bg-white/65 text-red-800" : trusted ? "border-emerald-700/15 bg-white/65 text-emerald-800" : "border-amber-700/15 bg-white/65 text-amber-800"}`}>{freshnessState || "UNPROVEN"}</span> : null}
          <button type="button" onClick={load} disabled={state.loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white/75 px-2.5 text-[8px] font-semibold text-[#716B63] disabled:opacity-50">
            <RefreshCw size={9} className={state.loading ? "animate-spin" : ""} />Refresh
          </button>
        </div>
      </div>
    </section>
  );
}
