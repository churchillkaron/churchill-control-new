"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { useFinanceLandingRuntime } from "@/components/workspace/finance/FinanceLandingRuntimeProvider";

function financeHref(organizationId, route) {
  if (!organizationId || !route) return "#";
  return `/workspace/${organizationId}${route.startsWith("/") ? route : `/${route}`}`;
}

function money(value, currency) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(undefined, currency ? {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    } : { maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency || ""} ${amount.toFixed(2)}`.trim();
  }
}

function tone(state) {
  if (state === "BLOCKED") return "border-red-700/15 bg-red-50 text-red-800";
  if (state === "ACTION_REQUIRED") return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (state === "WATCH") return "border-[#A37849]/15 bg-[#FBF8F3] text-[#76583A]";
  return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
}

function StateIcon({ state }) {
  if (state === "BLOCKED") return <ShieldAlert size={11} />;
  if (state === "ACTION_REQUIRED" || state === "WATCH") return <AlertTriangle size={11} />;
  return <CheckCircle2 size={11} />;
}

export default function FinanceAccountHealthPanel({ organizationId }) {
  const {
    entityId,
    periodId,
    accountHealth,
    currency,
    loading,
    refreshing,
    error,
    stale,
    refresh,
  } = useFinanceLandingRuntime();
  const health = accountHealth?.health || null;
  const focusRows = useMemo(
    () => (Array.isArray(health?.accounts) ? health.accounts.filter((row) => row.state !== "ON_TRACK").slice(0, 8) : []),
    [health],
  );

  if (!organizationId || !entityId || !periodId) return null;
  if (loading && !health) {
    return (
      <div className="mx-auto mb-4 flex min-h-[76px] max-w-[1720px] items-center justify-center rounded-[20px] border border-black/[0.07] bg-white text-[8px] text-[#817A72]">
        <LoaderCircle size={11} className="mr-2 animate-spin text-[#A37849]" /> Reading account-level accounting truth…
      </div>
    );
  }
  if (!health) return null;

  const summary = health.summary || {};

  return (
    <section aria-label="Finance account health" className="mx-auto mb-4 max-w-[1720px] overflow-hidden rounded-[22px] border border-black/[0.07] bg-white text-[#2A2723]">
      <div className="flex flex-col gap-3 border-b border-black/[0.06] px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between md:px-5">
        <div className="min-w-0 max-w-4xl">
          <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Account health</div>
          <h2 className="mt-1 text-[14px] font-semibold tracking-[-0.02em]">Which accounts are drifting — and why</h2>
          <p className="mt-0.5 text-[8px] leading-4 text-[#918B83]">Deterministic ledger structure and reconciliation evidence first; movement watches second. No audit materiality claim is inferred.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <span className="text-[8px] text-[#8B847B]"><strong className="font-semibold text-[#5E5952]">{summary.blocked || 0}</strong> blocked</span>
          <span className="text-[8px] text-[#8B847B]"><strong className="font-semibold text-[#5E5952]">{summary.action_required || 0}</strong> action</span>
          <span className="text-[8px] text-[#8B847B]"><strong className="font-semibold text-[#5E5952]">{summary.watch || 0}</strong> watch</span>
          <button type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh Finance landing snapshot" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.08] bg-white text-[#806143] disabled:opacity-50">
            <RefreshCw size={10} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {focusRows.length ? (
        <>
          <div className="hidden grid-cols-[minmax(230px,1.05fr)_115px_110px_minmax(280px,1.4fr)_minmax(220px,1fr)_70px] gap-3 border-b border-black/[0.05] bg-[#FCFBF8] px-4 py-2 text-[7px] font-semibold uppercase tracking-[0.11em] text-[#969087] md:grid md:px-5">
            <span>Account</span><span>State</span><span>Closing</span><span>Why</span><span>Next safe action</span><span></span>
          </div>
          {focusRows.map((row) => (
            <Link key={row.account_id} href={financeHref(organizationId, row.href)} className="grid gap-2 border-b border-black/[0.05] px-4 py-3 last:border-0 hover:bg-[#FCFAF6] md:grid-cols-[minmax(230px,1.05fr)_115px_110px_minmax(280px,1.4fr)_minmax(220px,1fr)_70px] md:items-center md:gap-3 md:px-5">
              <div className="min-w-0">
                <div className="truncate text-[9px] font-semibold text-[#403C37]">{row.account_code ? `${row.account_code} · ` : ""}{row.account_name}</div>
                <div className="mt-0.5 text-[7px] uppercase tracking-[0.07em] text-[#A09A92]">{row.classification || "unclassified"} · {row.transaction_count || 0} lines this period</div>
              </div>
              <div><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.04em] ${tone(row.state)}`}><StateIcon state={row.state} />{row.state_label}</span></div>
              <div className="text-[8px] font-semibold tabular-nums text-[#4B4640]">{money(row.closing_amount, currency)}</div>
              <div className="text-[8px] leading-4 text-[#7F786F]">{row.reason}</div>
              <div className="text-[8px] leading-4 text-[#6D675F]">{row.next_action}</div>
              <div className="flex justify-end"><span className="inline-flex items-center gap-1 text-[8px] font-semibold text-[#76583A]">Open <ArrowRight size={8} /></span></div>
            </Link>
          ))}
        </>
      ) : (
        <div className="flex items-center gap-2 px-5 py-6 text-[9px] text-[#65715F]"><CheckCircle2 size={12} /> No account-level exception is surfaced from the available ledger and reconciliation truth.</div>
      )}

      <div className="flex flex-col gap-1 border-t border-black/[0.05] bg-[#FCFBF8] px-4 py-2 text-[7px] text-[#938C84] sm:flex-row sm:items-center sm:justify-between md:px-5">
        <span>{summary.opposite_normal_balance || 0} opposite-normal-balance · {summary.unmapped_cash || 0} cash account without bank mapping · as of {summary.as_of || "selected period"}</span>
        <span>{error ? `${stale ? "Refresh delayed" : "Account health unavailable"} · ${error}` : "Structural accounting exceptions outrank statistical movement watches."}</span>
      </div>
    </section>
  );
}
