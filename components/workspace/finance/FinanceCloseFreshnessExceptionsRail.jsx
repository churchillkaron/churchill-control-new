"use client";

import Link from "next/link";
import { AlertTriangle, FileClock, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

function shortDate(value) {
  return value ? String(value).slice(0, 10) : "Unknown date";
}

function label(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function FinanceCloseFreshnessExceptionsRail({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });

  async function load() {
    if (!organizationId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const url = new URL("/api/workspace/finance/close-freshness-exceptions", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Closed-package freshness control unavailable");
      setState({ loading: false, error: "", data: body });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Closed-package freshness control unavailable", data: null });
    }
  }

  useEffect(() => {
    load();
  }, [organizationId]);

  if (!organizationId) return null;
  if (state.loading && !state.data) {
    return (
      <section className="mx-auto mb-4 flex min-h-[64px] max-w-[1720px] items-center rounded-[20px] border border-black/[0.07] bg-white px-4 text-[8px] text-[#817A72]">
        <LoaderCircle size={11} className="mr-2 animate-spin text-[#A37849]" /> Checking signed close packages across client files…
      </section>
    );
  }

  const exceptions = Array.isArray(state.data?.exceptions) ? state.data.exceptions : [];
  if (!state.error && exceptions.length === 0) return null;

  return (
    <section aria-label="Closed package freshness exceptions" className="mx-auto mb-4 max-w-[1720px] overflow-hidden rounded-[22px] border border-red-700/12 bg-[#FFFDFC] text-[#2A2723]">
      <div className="flex flex-col gap-3 border-b border-black/[0.06] px-4 py-3.5 lg:flex-row lg:items-start lg:justify-between md:px-5">
        <div className="flex min-w-0 items-start gap-3">
          {state.error ? <ShieldAlert size={15} className="mt-0.5 shrink-0 text-[#9A533D]" /> : <FileClock size={15} className="mt-0.5 shrink-0 text-[#9A533D]" />}
          <div className="min-w-0">
            <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Closed package freshness</div>
            <h2 className="mt-1 text-[14px] font-semibold tracking-[-0.02em]">
              {state.error ? "Freshness control unavailable — closed packages are not trusted" : "Previously closed client periods changed after final close"}
            </h2>
            <p className="mt-0.5 max-w-4xl text-[8px] leading-4 text-[#918B83]">
              {state.error
                ? "Avantiqo could not completely re-read the recent closed-package population. It will not present the firm portfolio as clean while this control is unavailable."
                : "Only accounting evidence that differs from the governed close baseline appears here. Open the exact client period, repair or re-review what changed, then perform a governed close again before relying on the package."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start">
          {!state.error ? <span className="rounded-full border border-red-700/12 bg-red-50 px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.05em] text-red-800">{exceptions.length} exception{exceptions.length === 1 ? "" : "s"}</span> : null}
          <button type="button" onClick={load} disabled={state.loading} aria-label="Refresh closed package freshness" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold text-[#716B63] disabled:opacity-50">
            <RefreshCw size={9} className={state.loading ? "animate-spin" : ""} />Refresh
          </button>
        </div>
      </div>

      {state.error ? (
        <div className="flex items-start gap-2 px-4 py-3 text-[8px] leading-4 text-[#8D5B49] md:px-5">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {state.error}
        </div>
      ) : (
        <div className="divide-y divide-black/[0.05]">
          {exceptions.map((row) => (
            <div key={row.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(180px,0.8fr)_minmax(180px,0.75fr)_minmax(310px,1.4fr)_130px] md:items-center md:gap-4 md:px-5">
              <div className="min-w-0">
                <div className="truncate text-[9px] font-semibold text-[#403C37]">{row.client_name || "Client organization"}</div>
                <div className="mt-0.5 text-[7px] uppercase tracking-[0.08em] text-[#A09A92]">{label(row.close_type || "period close")}</div>
              </div>
              <div className="min-w-0 text-[8px] text-[#756F67]">
                <div className="font-semibold text-[#5E5952]">{shortDate(row.period_start)} → {shortDate(row.period_end)}</div>
                <div className="mt-0.5 text-[7px] text-[#99928A]">Closed {shortDate(row.closed_at)} · {label(row.freshness_state)}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[8px] font-semibold text-[#6F5140]">{row.reason || "Closed package freshness is unproven."}</div>
                {Array.isArray(row.changed_labels) && row.changed_labels.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {row.changed_labels.slice(0, 5).map((changedLabel) => (
                      <span key={changedLabel} className="rounded-full border border-red-700/10 bg-red-50/70 px-2 py-1 text-[7px] font-semibold text-[#8F5848]">{changedLabel}</span>
                    ))}
                  </div>
                ) : row.control_error ? <div className="mt-1 text-[7px] text-[#9A6652]">Control error · {row.control_error}</div> : null}
              </div>
              <div className="flex items-center justify-start md:justify-end">
                <Link href={row.close_href || "#"} className="inline-flex h-8 items-center rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white">Open client close →</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 border-t border-black/[0.05] bg-[#FCFBF8] px-4 py-2 text-[7px] text-[#938C84] sm:flex-row sm:items-center sm:justify-between md:px-5">
        <span>Recent governed close packages are revalidated against live ledger, journal, reconciliation, tax, close-step, review and approval evidence.</span>
        <span>{state.data?.integrity?.recent_window_days ? `Interactive window · ${state.data.integrity.recent_window_days} days` : "Fail-closed if the complete control population cannot be read."}</span>
      </div>
    </section>
  );
}
