"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, FileCheck2, RefreshCw } from "lucide-react";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function money(value, currency = "THB") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "THB",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${currency || ""} ${numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
  }
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function isoUtc(value) {
  const match = String(value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const valueUtc = Date.UTC(year, month - 1, day);
  const parsed = new Date(valueUtc);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return valueUtc;
}

function daysBetweenIso(fromDate, toDate) {
  const from = isoUtc(fromDate);
  const to = isoUtc(toDate);
  if (from === null || to === null) return null;
  return Math.round((to - from) / 86400000);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

function tone(state) {
  if (state === "SUBMITTED" || state === "READY_TO_FILE") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (state === "NEEDS_ATTENTION") return "border-red-700/15 bg-red-50 text-red-800";
  return "border-amber-700/15 bg-amber-50 text-amber-900";
}

export default function FinanceTaxReturnCloseSheet({ organizationId, entityId, selectedVatReturnId, onStageChange }) {
  const [snapshot, setSnapshot] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [submissionReference, setSubmissionReference] = useState("");

  useEffect(() => {
    if (!organizationId || !entityId || !selectedVatReturnId) {
      setSnapshot(null);
      return;
    }
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const url = new URL("/api/finance/tax/runtime", window.location.origin);
        url.searchParams.set("organizationId", organizationId);
        url.searchParams.set("entityId", entityId);
        url.searchParams.set("vatReturnId", selectedVatReturnId);
        const body = await requestJson(url.toString());
        if (active && body?.preflight?.return?.id === selectedVatReturnId) setSnapshot(body.preflight);
        else if (active) setSnapshot(null);
      } catch (loadError) {
        if (active) {
          setSnapshot(null);
          setError(loadError?.message || "VAT close sheet could not be loaded");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [entityId, organizationId, refreshKey, selectedVatReturnId]);

  const vatReturn = snapshot?.return || null;
  const currency = snapshot?.entity?.functional_currency || vatReturn?.currency_code || "THB";
  const state = upper(snapshot?.state || vatReturn?.status);
  const blockers = useMemo(() => (snapshot?.checks || []).filter(item => upper(item.status) === "BLOCK"), [snapshot?.checks]);
  const dueDays = daysBetweenIso(snapshot?.due?.legal_date, vatReturn?.filing_due_date);
  const payable = Number(snapshot?.current?.tax_payable || 0);
  const refund = Number(snapshot?.current?.tax_refund || 0);
  const previousAdjustment = Number(snapshot?.current?.previous_period_adjustment);
  const hasPreviousAdjustment = Number.isFinite(previousAdjustment) && previousAdjustment !== 0;

  async function calculate() {
    if (!vatReturn?.id || busy) return;
    try {
      setBusy(true);
      setError("");
      await requestJson("/api/finance/vat-returns/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, entityId, vatReturnId: vatReturn.id }),
      });
      setRefreshKey(value => value + 1);
    } catch (actionError) {
      setError(actionError?.message || "VAT return calculation failed");
    } finally {
      setBusy(false);
    }
  }

  async function recordSubmission() {
    if (!vatReturn?.id || !submissionReference.trim() || busy) {
      if (!submissionReference.trim()) setError("Enter the authority submission reference before recording the filing.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      await requestJson("/api/finance/vat-returns/mark-submitted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, entityId, vatReturnId: vatReturn.id, submissionReference: submissionReference.trim() }),
      });
      setSubmissionReference("");
      setSubmissionOpen(false);
      setRefreshKey(value => value + 1);
    } catch (actionError) {
      setError(actionError?.message || "VAT filing evidence could not be recorded");
    } finally {
      setBusy(false);
    }
  }

  if (!selectedVatReturnId) return null;

  if (!snapshot) {
    return <section className="mx-auto mt-3 max-w-[1760px] px-4 sm:px-5 lg:px-6"><div className="rounded-xl border border-black/[0.07] bg-white p-3 text-[10px] text-[#817B73]">{loading ? "Loading VAT close sheet…" : error || "Select a VAT filing to see the close sheet."}</div></section>;
  }

  const submitted = upper(vatReturn?.status) === "SUBMITTED";
  const needsFix = !submitted && (blockers.length > 0 || !snapshot.ready_to_calculate);
  const canSubmit = !submitted && snapshot.ready_to_submit === true;
  const primaryLabel = submitted
    ? "Continue to amendment & settlement"
    : needsFix
      ? `Fix ${blockers.length || "filing"} blocker${blockers.length === 1 ? "" : "s"}`
      : canSubmit
        ? "Record authority submission"
        : snapshot.calculation_stale || upper(vatReturn?.status) === "CALCULATED"
          ? "Recalculate from evidence"
          : "Calculate from evidence";

  function primaryAction() {
    if (submitted) return onStageChange?.("AFTER");
    if (needsFix) return onStageChange?.("FIX");
    if (canSubmit) return setSubmissionOpen(true);
    return calculate();
  }

  return (
    <section className="mx-auto mt-3 max-w-[1760px] px-4 sm:px-5 lg:px-6">
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_10px_35px_rgba(35,31,27,0.04)]">
        <div className="flex flex-col gap-3 border-b border-black/[0.07] px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9A7045]">VAT close sheet</div>
            <div className="mt-1 flex flex-wrap items-center gap-2"><h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#26231F]">{vatReturn.jurisdiction_code || "VAT"} · {date(vatReturn.period_start)} — {date(vatReturn.period_end)}</h2><span className={`rounded-md border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] ${tone(state)}`}>{state.replaceAll("_", " ") || "DRAFT"}</span></div>
            <div className="mt-1 text-[9px] text-[#817B73]">One filing, one current accounting truth, one next action.</div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <button onClick={() => onStageChange?.("EVIDENCE")} disabled={busy || loading} className="h-9 rounded-lg border border-black/[0.09] bg-white px-3 text-[10px] font-semibold text-[#4B4640] disabled:cursor-not-allowed disabled:opacity-40">Inspect evidence</button>
            <button onClick={primaryAction} disabled={busy || loading} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#1F1E1B] px-3.5 text-[10px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? <RefreshCw size={12} className="animate-spin" /> : submitted ? <FileCheck2 size={12} /> : needsFix ? <AlertTriangle size={12} /> : <ArrowRight size={12} />}{busy ? "Working…" : primaryLabel}</button>
          </div>
        </div>

        <div className={`grid gap-px bg-black/[0.06] ${hasPreviousAdjustment ? "sm:grid-cols-3 xl:grid-cols-6" : "sm:grid-cols-2 xl:grid-cols-5"}`}>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#928C84]">Output VAT</div><div className="mt-1 text-[13px] font-semibold tabular-nums text-[#2E2A26]">{money(snapshot.current?.output_tax, currency)}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#928C84]">Input VAT</div><div className="mt-1 text-[13px] font-semibold tabular-nums text-[#2E2A26]">{money(snapshot.current?.input_tax, currency)}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#928C84]">Net position</div><div className="mt-1 text-[13px] font-semibold tabular-nums text-[#2E2A26]">{payable > 0 ? `${money(payable, currency)} payable` : refund > 0 ? `${money(refund, currency)} refund` : money(0, currency)}</div></div>
          {hasPreviousAdjustment ? <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#928C84]">Prior adjustment</div><div className="mt-1 text-[13px] font-semibold tabular-nums text-[#2E2A26]">{money(previousAdjustment, currency)}</div></div> : null}
          <div className="bg-[#FAF9F7] p-3"><div className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.09em] text-[#928C84]"><CalendarClock size={10} /> Deadline</div><div className="mt-1 text-[13px] font-semibold text-[#2E2A26]">{date(vatReturn.filing_due_date)}</div><div className={`mt-0.5 text-[8px] ${dueDays !== null && dueDays < 0 ? "text-red-800" : "text-[#817B73]"}`}>{dueDays === null ? "Governed legal date unavailable" : dueDays < 0 ? `${Math.abs(dueDays)} day${Math.abs(dueDays) === 1 ? "" : "s"} overdue` : dueDays === 0 ? "Due today" : `${dueDays} day${dueDays === 1 ? "" : "s"} remaining`}{snapshot?.due?.legal_time_zone ? ` · ${snapshot.due.legal_time_zone}` : ""}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#928C84]">Readiness</div><div className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${submitted || canSubmit ? "text-emerald-800" : needsFix ? "text-red-800" : "text-amber-900"}`}>{submitted || canSubmit ? <CheckCircle2 size={12} /> : needsFix ? <AlertTriangle size={12} /> : <RefreshCw size={12} />}{submitted ? "Filed" : canSubmit ? "Ready to file" : needsFix ? "Needs attention" : "Ready to calculate"}</div><div className="mt-0.5 text-[8px] text-[#817B73]">{blockers.length ? `${blockers.length} live blocker${blockers.length === 1 ? "" : "s"}` : snapshot.calculation_stale ? "Source evidence changed" : "Live preflight current"}</div></div>
        </div>

        {needsFix ? <div className="flex items-start gap-2 border-t border-red-700/10 bg-red-50 px-4 py-3 text-[9px] leading-4 text-red-900"><AlertTriangle size={12} className="mt-0.5 shrink-0" /><div><div className="font-semibold">Do not calculate around a blocker.</div><div className="mt-0.5">Open Fix issues to correct the source accounting workflow. Ownership, client requests and AI advice cannot clear live accounting truth.</div></div></div> : null}

        {submissionOpen && canSubmit ? <div className="border-t border-black/[0.07] bg-[#FAF9F7] px-4 py-3"><div className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#817B73]">Real authority filing evidence</div><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input value={submissionReference} onChange={event => setSubmissionReference(event.target.value)} placeholder="Submission / receipt reference" className="h-9 min-w-0 flex-1 rounded-lg border border-black/[0.09] bg-white px-3 text-[10px] outline-none" /><button onClick={() => setSubmissionOpen(false)} className="h-9 rounded-lg border border-black/[0.09] bg-white px-3 text-[10px] font-medium">Cancel</button><button onClick={recordSubmission} disabled={busy || !submissionReference.trim()} className="h-9 rounded-lg bg-[#1F1E1B] px-3.5 text-[10px] font-semibold text-white disabled:opacity-40">Confirm filed</button></div><div className="mt-1.5 text-[8px] leading-4 text-[#817B73]">Avantiqo records the authority reference you actually received. It does not claim a government connector submitted this return.</div></div> : null}

        {error ? <div className="border-t border-red-700/10 bg-red-50 px-4 py-2.5 text-[9px] text-red-800">{error}</div> : null}
      </div>
    </section>
  );
}
