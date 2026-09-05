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

function dateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
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

function warningControlLabel(code) {
  if (code === "POTENTIAL_DUPLICATES") return "Purchase VAT · duplicate review";
  if (code === "FILING_DEADLINE") return "Filing control · statutory deadline";
  return "VAT filing review";
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
  const checks = useMemo(() => (Array.isArray(snapshot?.checks) ? snapshot.checks : []), [snapshot?.checks]);
  const blockers = useMemo(() => checks.filter(item => upper(item.status) === "BLOCK"), [checks]);
  const warnings = useMemo(() => checks.filter(item => upper(item.status) === "WARNING"), [checks]);
  const dueDays = daysBetweenIso(snapshot?.due?.legal_date, vatReturn?.filing_due_date);
  const payable = Number(snapshot?.current?.tax_payable || 0);
  const refund = Number(snapshot?.current?.tax_refund || 0);
  const previousAdjustment = Number(snapshot?.current?.previous_period_adjustment);
  const hasPreviousAdjustment = Number.isFinite(previousAdjustment) && previousAdjustment !== 0;
  const outputIncluded = Number(snapshot?.current?.output_document_count || 0);
  const inputIncluded = Number(snapshot?.current?.input_document_count || 0);
  const creditNotes = Number(snapshot?.current?.customer_credit_note_count || 0);
  const outputObserved = Number(snapshot?.evidence?.output_total ?? outputIncluded);
  const inputObserved = Number(snapshot?.evidence?.input_total ?? inputIncluded);
  const exceptionTotal = Number(snapshot?.evidence?.exception_total || 0);
  const calculatedAt = snapshot?.calculated?.at || null;
  const calculatedValues = snapshot?.calculated?.values && typeof snapshot.calculated.values === "object" ? snapshot.calculated.values : {};
  const freshnessReasons = Array.isArray(snapshot?.calculated?.freshness_reasons) ? snapshot.calculated.freshness_reasons : [];
  const hasCalculatedSnapshot = Boolean(calculatedAt || Object.keys(calculatedValues).length);

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
  const calculationProofLabel = submitted
    ? "Filed calculation locked"
    : snapshot.calculation_stale
      ? "Evidence changed · recalculate"
      : hasCalculatedSnapshot
        ? "Calculation matches live evidence"
        : snapshot.ready_to_calculate
          ? "Ready for governed calculation"
          : "Blocked by live evidence";
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
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#928C84]">Output VAT</div><div className="mt-1 text-[13px] font-semibold tabular-nums text-[#2E2A26]">{money(snapshot.current?.output_tax, currency)}</div><div className="mt-0.5 text-[8px] text-[#817B73]">{outputIncluded} included sales document{outputIncluded === 1 ? "" : "s"}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#928C84]">Input VAT</div><div className="mt-1 text-[13px] font-semibold tabular-nums text-[#2E2A26]">{money(snapshot.current?.input_tax, currency)}</div><div className="mt-0.5 text-[8px] text-[#817B73]">{inputIncluded} included purchase document{inputIncluded === 1 ? "" : "s"}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#928C84]">Net position</div><div className="mt-1 text-[13px] font-semibold tabular-nums text-[#2E2A26]">{payable > 0 ? `${money(payable, currency)} payable` : refund > 0 ? `${money(refund, currency)} refund` : money(0, currency)}</div><div className="mt-0.5 text-[8px] text-[#817B73]">Output VAT less input VAT</div></div>
          {hasPreviousAdjustment ? <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#928C84]">Prior adjustment</div><div className="mt-1 text-[13px] font-semibold tabular-nums text-[#2E2A26]">{money(previousAdjustment, currency)}</div></div> : null}
          <div className="bg-[#FAF9F7] p-3"><div className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.09em] text-[#928C84]"><CalendarClock size={10} /> Deadline</div><div className="mt-1 text-[13px] font-semibold text-[#2E2A26]">{date(vatReturn.filing_due_date)}</div><div className={`mt-0.5 text-[8px] ${dueDays !== null && dueDays < 0 ? "text-red-800" : "text-[#817B73]"}`}>{dueDays === null ? "Governed legal date unavailable" : dueDays < 0 ? `${Math.abs(dueDays)} day${Math.abs(dueDays) === 1 ? "" : "s"} overdue` : dueDays === 0 ? "Due today" : `${dueDays} day${dueDays === 1 ? "" : "s"} remaining`}{snapshot?.due?.legal_time_zone ? ` · ${snapshot.due.legal_time_zone}` : ""}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#928C84]">Readiness</div><div className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${submitted || canSubmit ? "text-emerald-800" : needsFix ? "text-red-800" : "text-amber-900"}`}>{submitted || canSubmit ? <CheckCircle2 size={12} /> : needsFix ? <AlertTriangle size={12} /> : <RefreshCw size={12} />}{submitted ? "Filed" : canSubmit ? "Ready to file" : needsFix ? "Needs attention" : "Ready to calculate"}</div><div className="mt-0.5 text-[8px] text-[#817B73]">{blockers.length ? `${blockers.length} live blocker${blockers.length === 1 ? "" : "s"}` : snapshot.calculation_stale ? "Source evidence changed" : "Live preflight current"}</div></div>
        </div>

        <div className="border-t border-black/[0.07] px-4 py-3.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#9A7045]">Review before filing</div>
              <div className="mt-1 text-[9px] text-[#817B73]">Reconcile the VAT result to the complete governed source population before recording the authority filing.</div>
            </div>
            <span className={`inline-flex w-fit items-center gap-1 rounded-md border px-2 py-1 text-[8px] font-semibold ${snapshot.calculation_stale || needsFix ? "border-red-700/15 bg-red-50 text-red-800" : submitted || hasCalculatedSnapshot ? "border-emerald-700/15 bg-emerald-50 text-emerald-800" : "border-amber-700/15 bg-amber-50 text-amber-900"}`}>{snapshot.calculation_stale || needsFix ? <AlertTriangle size={10} /> : submitted || hasCalculatedSnapshot ? <CheckCircle2 size={10} /> : <RefreshCw size={10} />}{calculationProofLabel}</span>
          </div>

          <div className="mt-3 grid overflow-hidden rounded-xl border border-black/[0.07] bg-black/[0.05] md:grid-cols-[1fr_auto_1fr_auto_1fr]">
            <div className="bg-white p-3"><div className="text-[7px] font-semibold uppercase tracking-[0.09em] text-[#928C84]">Sales VAT included</div><div className="mt-1 text-[12px] font-semibold tabular-nums text-[#312E2A]">{money(snapshot.current?.output_tax, currency)}</div><div className="mt-1 text-[8px] leading-4 text-[#817B73]">{outputIncluded} of {outputObserved} VAT-bearing sales document{outputObserved === 1 ? "" : "s"} included{creditNotes ? ` · ${creditNotes} credit note${creditNotes === 1 ? "" : "s"}` : ""}.</div></div>
            <div className="flex items-center justify-center bg-[#FAF9F7] px-3 py-2 text-[14px] font-semibold text-[#9B948C]">−</div>
            <div className="bg-white p-3"><div className="text-[7px] font-semibold uppercase tracking-[0.09em] text-[#928C84]">Purchase VAT included</div><div className="mt-1 text-[12px] font-semibold tabular-nums text-[#312E2A]">{money(snapshot.current?.input_tax, currency)}</div><div className="mt-1 text-[8px] leading-4 text-[#817B73]">{inputIncluded} of {inputObserved} VAT-bearing purchase document{inputObserved === 1 ? "" : "s"} included.</div></div>
            <div className="flex items-center justify-center bg-[#FAF9F7] px-3 py-2 text-[14px] font-semibold text-[#9B948C]">=</div>
            <div className="bg-[#FFF9F0] p-3"><div className="text-[7px] font-semibold uppercase tracking-[0.09em] text-[#8A633E]">Current VAT result</div><div className="mt-1 text-[12px] font-semibold tabular-nums text-[#312E2A]">{payable > 0 ? `${money(payable, currency)} payable` : refund > 0 ? `${money(refund, currency)} refund` : money(0, currency)}</div><div className="mt-1 text-[8px] leading-4 text-[#76583A]">Built from the live preflight population, not from a manually entered return total.</div></div>
          </div>

          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            <div className="rounded-lg border border-black/[0.07] bg-[#FAF9F7] p-3">
              <div className="text-[7px] font-semibold uppercase tracking-[0.09em] text-[#928C84]">Source coverage</div>
              <div className="mt-1 text-[9px] font-semibold text-[#3F3A35]">{exceptionTotal ? `${exceptionTotal} source exception${exceptionTotal === 1 ? "" : "s"} detected across the filing population.` : "Complete VAT source population has no recorded source exception."}</div>
              <div className="mt-1 text-[8px] leading-4 text-[#817B73]">Included means the document passed the governed coding, approval, posting and exchange-rate rules required for this VAT calculation. {warnings.length ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"} still require human review.` : "No non-blocking review warning is open."}</div>
            </div>
            <div className="rounded-lg border border-black/[0.07] bg-[#FAF9F7] p-3">
              <div className="text-[7px] font-semibold uppercase tracking-[0.09em] text-[#928C84]">Calculation evidence</div>
              {hasCalculatedSnapshot ? <><div className="mt-1 text-[9px] font-semibold text-[#3F3A35]">Last governed calculation · {dateTime(calculatedAt)}</div><div className="mt-1 text-[8px] leading-4 text-[#817B73]">{snapshot.calculation_stale ? "Evidence changed since the last calculation. Recalculate before filing." : "Stored calculation matches the current governed evidence population."}</div>{freshnessReasons.length ? <div className="mt-1 text-[8px] leading-4 text-red-800">Changed: {freshnessReasons.join(" · ")}</div> : null}</> : <><div className="mt-1 text-[9px] font-semibold text-[#3F3A35]">No governed calculation has been saved yet.</div><div className="mt-1 text-[8px] leading-4 text-[#817B73]">The figures above are the live evidence preview. Use Calculate from evidence to persist the filing calculation after all blocking checks pass.</div></>}
            </div>
          </div>

          {warnings.length ? <div className="mt-2 overflow-hidden rounded-xl border border-amber-800/15 bg-amber-50/40">
            <div className="flex flex-col gap-2 border-b border-amber-800/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-amber-900">Review items · non-blocking</div><div className="mt-0.5 text-[8px] leading-4 text-[#817B73]">These items need accountant attention but do not become accounting truth by being acknowledged. Trace the source evidence before filing.</div></div>
              <button onClick={() => onStageChange?.("EVIDENCE")} className="h-8 shrink-0 rounded-lg border border-amber-900/15 bg-white px-3 text-[9px] font-semibold text-amber-950">Inspect review evidence</button>
            </div>
            <div className="divide-y divide-amber-900/10">
              {warnings.map(item => {
                const code = upper(item.code);
                const count = Number(item.count || 0);
                return <div key={code || item.label} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[150px_1fr_auto] sm:items-start">
                  <div><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#9A7045]">{warningControlLabel(code)}</div><div className="mt-0.5 text-[8px] text-[#928C84]">Warning · review only</div></div>
                  <div><div className="text-[9px] font-semibold text-[#3F3A35]">{item.label || code.replaceAll("_", " ")}</div><div className="mt-0.5 text-[8px] leading-4 text-[#817B73]">{item.detail || "Inspect the governed source evidence before filing."}</div></div>
                  <div className="text-left sm:text-right"><div className="text-[12px] font-semibold tabular-nums text-amber-950">{count}</div><div className="text-[7px] uppercase tracking-[0.08em] text-[#928C84]">item{count === 1 ? "" : "s"}</div></div>
                </div>;
              })}
            </div>
          </div> : null}
        </div>

        {needsFix ? <div className="flex items-start gap-2 border-t border-red-700/10 bg-red-50 px-4 py-3 text-[9px] leading-4 text-red-900"><AlertTriangle size={12} className="mt-0.5 shrink-0" /><div><div className="font-semibold">Do not calculate around a blocker.</div><div className="mt-0.5">Open Fix issues to correct the source accounting workflow. Ownership, client requests and AI advice cannot clear live accounting truth.</div></div></div> : null}

        {submissionOpen && canSubmit ? <div className="border-t border-black/[0.07] bg-[#FAF9F7] px-4 py-3"><div className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#817B73]">Real authority filing evidence</div><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input value={submissionReference} onChange={event => setSubmissionReference(event.target.value)} placeholder="Submission / receipt reference" className="h-9 min-w-0 flex-1 rounded-lg border border-black/[0.09] bg-white px-3 text-[10px] outline-none" /><button onClick={() => setSubmissionOpen(false)} className="h-9 rounded-lg border border-black/[0.09] bg-white px-3 text-[10px] font-medium">Cancel</button><button onClick={recordSubmission} disabled={busy || !submissionReference.trim()} className="h-9 rounded-lg bg-[#1F1E1B] px-3.5 text-[10px] font-semibold text-white disabled:opacity-40">Confirm filed</button></div><div className="mt-1.5 text-[8px] leading-4 text-[#817B73]">Avantiqo records the authority reference you actually received. It does not claim a government connector submitted this return.</div></div> : null}

        {error ? <div className="border-t border-red-700/10 bg-red-50 px-4 py-2.5 text-[9px] text-red-800">{error}</div> : null}
      </div>
    </section>
  );
}
