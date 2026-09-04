"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import WorkspaceEventHub from "@/components/workspace/WorkspaceEventHub";
import { getFinanceTaxCalendarOptions, resolveFinanceTaxDeadline } from "@/lib/finance/tax/FinanceTaxCalendarPolicy";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function dateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
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
    return `${currency || ""} ${numeric.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`.trim();
  }
}

function stateTone(value) {
  const state = upper(value);
  if (["SUBMITTED", "READY_TO_FILE"].includes(state)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (state === "NEEDS_ATTENTION") return "border-red-700/15 bg-red-50 text-red-800";
  if (["CALCULATED", "READY_TO_CALCULATE"].includes(state)) return "border-amber-700/15 bg-amber-50 text-amber-900";
  return "border-black/[0.08] bg-[#F5F3EF] text-[#6F6961]";
}

function checkTone(value) {
  const state = upper(value);
  if (state === "PASS") return "text-emerald-800";
  if (state === "BLOCK") return "text-red-800";
  if (state === "WARNING") return "text-amber-800";
  return "text-[#777169]";
}

function checkIcon(value) {
  const state = upper(value);
  if (state === "PASS") return <CheckCircle2 size={13} />;
  if (state === "BLOCK") return <AlertTriangle size={13} />;
  if (state === "WARNING") return <Clock3 size={13} />;
  return <ShieldCheck size={13} />;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

function humanState(value) {
  return upper(value).replaceAll("_", " ") || "DRAFT";
}

function returnSearchText(row) {
  return [row.return_number, row.registration_reference, row.jurisdiction_code, row.period_start, row.period_end, row.filing_due_date, row.status, row.submission_reference].filter(Boolean).join(" ").toLowerCase();
}

function EvidenceTable({ title, rows, currency, total, truncated }) {
  const values = Array.isArray(rows) ? rows : [];
  return (
    <section className="overflow-hidden rounded-xl border border-black/[0.07] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-black/[0.07] px-3 py-2.5">
        <div><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#817B73]">Source evidence</div><div className="mt-0.5 text-[11px] font-semibold text-[#37332F]">{title}</div></div>
        <div className="text-[9px] text-[#918B83]">{total ?? values.length} document{Number(total ?? values.length) === 1 ? "" : "s"}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-[10px]">
          <thead className="border-b border-black/[0.07] bg-[#FAF9F7] text-[9px] font-semibold uppercase tracking-[0.08em] text-[#858078]"><tr><th className="px-3 py-2.5">Document</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Currency</th><th className="px-3 py-2.5 text-right">Tax</th><th className="px-3 py-2.5 text-right">Functional tax</th><th className="px-3 py-2.5">Evidence state</th></tr></thead>
          <tbody>{values.map(row => { const ready = row.posted === true || (upper(row.status) === "POSTED" && upper(row.approval_status) === "APPROVED" && row.journal_entry_id); return <tr key={row.id} className="border-b border-black/[0.055]"><td className="px-3 py-3 font-medium text-[#37332F]">{row.reference || row.id}</td><td className="px-3 py-3">{date(row.date)}</td><td className="px-3 py-3">{row.currency_code || currency}</td><td className="px-3 py-3 text-right tabular-nums">{money(row.tax_amount, row.currency_code || currency)}</td><td className="px-3 py-3 text-right font-medium tabular-nums">{money(row.functional_tax_amount, currency)}</td><td className="px-3 py-3"><span className={`inline-flex items-center gap-1 ${ready ? "text-emerald-800" : "text-red-800"}`}>{ready ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}{ready ? "Included" : row.reversed_posting_only ? "Posting reversed" : "Needs attention"}</span></td></tr>; })}</tbody>
        </table>
        {!values.length ? <div className="p-6 text-center text-[10px] text-[#8A857D]">No source documents in this evidence set.</div> : null}
      </div>
      {truncated ? <div className="border-t border-amber-700/15 bg-amber-50 px-3 py-2 text-[9px] text-amber-900">Showing the first governed evidence rows only. The preflight calculation still evaluates the full population.</div> : null}
    </section>
  );
}

const EMPTY_FILING_FORM = {
  jurisdiction_code: "",
  period_start: "",
  period_end: "",
  filing_form_code: "PP30",
  filing_channel: "ONLINE",
  registration_reference: "",
  notes: "",
  deadline_override_enabled: false,
  filing_due_date: "",
  deadline_override_reason: "",
  deadline_override_evidence_reference: "",
};

export default function FinanceTaxWorkCenter({ organizationId, entityId, periodId, selectedVatReturnId, onSelectedVatReturnIdChange }) {
  const searchRef = useRef(null);
  const [workspace, setWorkspace] = useState(null);
  const [selectedId, setSelectedId] = useState(selectedVatReturnId || null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [newMode, setNewMode] = useState(false);
  const [submissionMode, setSubmissionMode] = useState(false);
  const [submissionReference, setSubmissionReference] = useState("");
  const [form, setForm] = useState(EMPTY_FILING_FORM);

  useEffect(() => {
    if (selectedVatReturnId && selectedVatReturnId !== selectedId) setSelectedId(selectedVatReturnId);
  }, [selectedVatReturnId]);

  useEffect(() => {
    if (!organizationId || !entityId) { setWorkspace(null); return; }
    let active = true;
    async function load() {
      try {
        setLoading(true); setError("");
        const url = new URL("/api/finance/tax/runtime", window.location.origin);
        url.searchParams.set("organizationId", organizationId);
        url.searchParams.set("entityId", entityId);
        if (selectedId) url.searchParams.set("vatReturnId", selectedId);
        const body = await requestJson(url.toString());
        if (!active) return;
        setWorkspace(body);
        const resolvedId = selectedId && body.returns?.some(row => row.id === selectedId) ? selectedId : body.selected_return_id || body.returns?.[0]?.id || null;
        setSelectedId(resolvedId);
        onSelectedVatReturnIdChange?.(resolvedId);
        setForm(current => ({
          ...current,
          jurisdiction_code: current.jurisdiction_code || body.setup?.suggested_jurisdiction || body.setup?.vat_regimes?.[0] || "",
          filing_form_code: current.filing_form_code || body.setup?.tax_calendar?.default_form_code || "PP30",
          filing_channel: current.filing_channel || body.setup?.tax_calendar?.default_filing_channel || "ONLINE",
          registration_reference: current.registration_reference || body.setup?.registration_reference || "",
        }));
      } catch (loadError) {
        if (active) { setWorkspace(null); setError(loadError?.message || "Tax workspace could not be loaded"); }
      } finally { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [entityId, organizationId, refreshKey, selectedId]);

  useEffect(() => {
    function onKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      if (event.key === "/") { event.preventDefault(); searchRef.current?.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const returns = Array.isArray(workspace?.returns) ? workspace.returns : [];
  const preflight = workspace?.preflight || null;
  const selectedReturn = preflight?.return || returns.find(row => row.id === selectedId) || null;
  const visibleReturns = useMemo(() => { const needle = query.trim().toLowerCase(); return returns.filter(row => { if (statusFilter && upper(row.status) !== statusFilter) return false; return !needle || returnSearchText(row).includes(needle); }); }, [query, returns, statusFilter]);
  const currency = preflight?.entity?.functional_currency || workspace?.setup?.entity?.functional_currency || "THB";
  const filingOptions = useMemo(() => getFinanceTaxCalendarOptions(form.jurisdiction_code || workspace?.setup?.suggested_jurisdiction || ""), [form.jurisdiction_code, workspace?.setup?.suggested_jurisdiction]);
  const deadlinePreview = useMemo(() => form.period_end && form.jurisdiction_code ? resolveFinanceTaxDeadline({ jurisdictionCode: form.jurisdiction_code, formCode: form.filing_form_code, filingChannel: form.filing_channel, periodEnd: form.period_end }) : null, [form.filing_channel, form.filing_form_code, form.jurisdiction_code, form.period_end]);
  const deadlineVerified = deadlinePreview?.verification_status === "OFFICIAL_CALENDAR_VERIFIED";
  const deadlineNeedsEvidence = Boolean(deadlinePreview && (!deadlinePreview.supported || !deadlineVerified || form.deadline_override_enabled));
  const governedDueDate = form.deadline_override_enabled || !deadlinePreview?.supported ? form.filing_due_date : deadlinePreview?.statutory_due_date || "";

  function openNewFiling() {
    const defaultJurisdiction = workspace?.setup?.suggested_jurisdiction || workspace?.setup?.vat_regimes?.[0] || form.jurisdiction_code || "";
    const options = getFinanceTaxCalendarOptions(defaultJurisdiction);
    setForm({
      ...EMPTY_FILING_FORM,
      jurisdiction_code: defaultJurisdiction,
      filing_form_code: options.default_form_code || "PP30",
      filing_channel: options.default_filing_channel || "ONLINE",
      registration_reference: workspace?.setup?.registration_reference || "",
    });
    setError("");
    setNewMode(true);
  }

  async function createReturn() {
    if (!form.jurisdiction_code || !form.period_start || !form.period_end) { setError("Choose the VAT jurisdiction and filing period before creating the filing obligation."); return; }
    if (form.period_end < form.period_start) { setError("Period end cannot be before period start."); return; }
    if (!deadlinePreview) { setError("Choose the filing form, channel and period so Avantiqo can resolve the statutory deadline."); return; }
    const evidenceDueDate = form.deadline_override_enabled || !deadlinePreview.supported ? form.filing_due_date : deadlinePreview.statutory_due_date;
    if (deadlineNeedsEvidence && (!text(evidenceDueDate) || !text(form.deadline_override_reason) || !text(form.deadline_override_evidence_reference))) {
      setError("This deadline requires a date, reason and authority evidence reference before the filing obligation can be created.");
      return;
    }
    try {
      setBusy(true); setError("");
      const body = await requestJson("/api/finance/tax/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          entityId,
          periodId,
          jurisdictionCode: form.jurisdiction_code,
          periodStart: form.period_start,
          periodEnd: form.period_end,
          filingFormCode: form.filing_form_code,
          filingChannel: form.filing_channel,
          filingDueDate: deadlineNeedsEvidence ? evidenceDueDate : null,
          deadlineOverrideReason: deadlineNeedsEvidence ? form.deadline_override_reason : null,
          deadlineOverrideEvidenceReference: deadlineNeedsEvidence ? form.deadline_override_evidence_reference : null,
          registrationReference: form.registration_reference || null,
          notes: form.notes,
        }),
      });
      const nextId = body.return?.id || null;
      setSelectedId(nextId); onSelectedVatReturnIdChange?.(nextId); setNewMode(false); setRefreshKey(value => value + 1);
    } catch (createError) { setError(createError?.message || "VAT filing obligation could not be created"); } finally { setBusy(false); }
  }

  async function calculateReturn() {
    if (!selectedReturn?.id) return;
    try { setBusy(true); setError(""); await requestJson("/api/finance/vat-returns/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, entityId, vatReturnId: selectedReturn.id }) }); setRefreshKey(value => value + 1); }
    catch (calculateError) { setError(calculateError?.message || "VAT return calculation failed"); } finally { setBusy(false); }
  }

  async function recordSubmission() {
    if (!selectedReturn?.id || !submissionReference.trim()) { setError("Enter the authority submission reference before recording the filing."); return; }
    try { setBusy(true); setError(""); await requestJson("/api/finance/vat-returns/mark-submitted", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, entityId, vatReturnId: selectedReturn.id, submissionReference: submissionReference.trim() }) }); setSubmissionMode(false); setSubmissionReference(""); setRefreshKey(value => value + 1); }
    catch (submitError) { setError(submitError?.message || "VAT filing evidence could not be recorded"); } finally { setBusy(false); }
  }

  return (
    <main className="min-h-[calc(100vh-112px)] bg-[#F7F6F3] text-[#1B1A18]">
      <div className="mx-auto max-w-[1760px] px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
        <header className="flex flex-col gap-3 border-b border-black/[0.07] pb-4 xl:flex-row xl:items-end xl:justify-between"><div><div className="text-[9px] font-semibold uppercase tracking-[0.21em] text-[#9A7045]">Finance / Tax</div><h1 className="mt-1.5 text-[28px] font-semibold tracking-[-0.035em]">Tax & VAT</h1><p className="mt-1 max-w-4xl text-[12px] leading-5 text-[#777169]">Work from filing obligation to governed source evidence, clear blockers, calculate from posted accounting records, then record the authority submission.</p></div><div className="flex items-center gap-2"><button onClick={() => setRefreshKey(value => value + 1)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.09] bg-white px-3 text-[11px] font-medium"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh</button><button onClick={openNewFiling} className="h-9 rounded-lg bg-[#1F1E1B] px-3.5 text-[11px] font-semibold text-white">New VAT filing</button></div></header>
        {!organizationId || !entityId ? <div className="mt-4 rounded-xl border border-amber-700/15 bg-amber-50 p-4 text-[12px] text-amber-900">Select a legal entity before working on tax filings.</div> : <>
          <section className="mt-4 grid gap-2 rounded-xl border border-black/[0.07] bg-white p-3 lg:grid-cols-[minmax(280px,1fr)_180px]"><div className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-[#FAF9F7] px-3"><Search size={14} className="text-[#9A958D]" /><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search period, jurisdiction, registration or reference…  /" className="h-9 min-w-0 flex-1 bg-transparent text-[10px] outline-none" /></div><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-9 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[10px]"><option value="">All filing statuses</option>{["DRAFT", "CALCULATED", "SUBMITTED"].map(value => <option key={value}>{value}</option>)}</select></section>
          {error ? <div className="mt-3 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[11px] text-red-800">{error}</div> : null}
          {newMode ? <section className="mt-3 overflow-hidden rounded-xl border border-black/[0.07] bg-white"><div className="border-b border-black/[0.07] px-4 py-3"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A7045]">Filing obligation</div><div className="mt-1 text-[13px] font-semibold">New VAT filing period</div><div className="mt-1 text-[10px] text-[#817B73]">Choose the statutory form and filing channel first. Avantiqo resolves the legal deadline from governed policy instead of asking the accountant to type a date.</div></div><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6"><label className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#817B73]">Jurisdiction<select value={form.jurisdiction_code} onChange={event => { const jurisdiction = event.target.value; const options = getFinanceTaxCalendarOptions(jurisdiction); setForm(current => ({ ...current, jurisdiction_code: jurisdiction, filing_form_code: options.default_form_code || "PP30", filing_channel: options.default_filing_channel || "ONLINE", deadline_override_enabled: false, filing_due_date: "", deadline_override_reason: "", deadline_override_evidence_reference: "" })); }} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[10px] font-normal normal-case tracking-normal"><option value="">Select</option>{workspace?.setup?.vat_regimes?.map(value => <option key={value}>{value}</option>)}</select></label><label className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#817B73]">Form<select value={form.filing_form_code} onChange={event => setForm(current => ({ ...current, filing_form_code: event.target.value, deadline_override_enabled: false, filing_due_date: "", deadline_override_reason: "", deadline_override_evidence_reference: "" }))} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[10px] font-normal normal-case tracking-normal">{filingOptions.forms.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#817B73]">Filing channel<select value={form.filing_channel} onChange={event => setForm(current => ({ ...current, filing_channel: event.target.value, deadline_override_enabled: false, filing_due_date: "", deadline_override_reason: "", deadline_override_evidence_reference: "" }))} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[10px] font-normal normal-case tracking-normal">{filingOptions.filing_channels.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#817B73]">Period start<input type="date" value={form.period_start} onChange={event => setForm(current => ({ ...current, period_start: event.target.value }))} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[10px] font-normal normal-case tracking-normal" /></label><label className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#817B73]">Period end<input type="date" value={form.period_end} onChange={event => setForm(current => ({ ...current, period_end: event.target.value, deadline_override_enabled: false, filing_due_date: "", deadline_override_reason: "", deadline_override_evidence_reference: "" }))} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[10px] font-normal normal-case tracking-normal" /></label><label className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#817B73]">Registration reference<input value={form.registration_reference} onChange={event => setForm(current => ({ ...current, registration_reference: event.target.value }))} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[10px] font-normal normal-case tracking-normal" /></label></div>{deadlinePreview ? <div className="mx-4 mb-4 rounded-xl border border-[#A37849]/18 bg-[#FFF9F0] p-3.5"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#8A633E]"><CalendarClock size={12} /> Governed statutory deadline</div><div className="mt-1.5 text-[18px] font-semibold tracking-[-0.02em] text-[#2A2723]">{date(governedDueDate)}</div><div className="mt-1 text-[9px] leading-4 text-[#76583A]">{deadlinePreview.form_label || form.filing_form_code} · {deadlinePreview.filing_channel_label || form.filing_channel}{deadlinePreview.adjustment?.applied ? ` · adjusted ${deadlinePreview.adjustment.days} day${deadlinePreview.adjustment.days === 1 ? "" : "s"} for ${String(deadlinePreview.adjustment.reason || "").replaceAll("_", " ").toLowerCase()}` : ""}</div></div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-md border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] ${deadlineVerified ? "border-emerald-700/15 bg-emerald-50 text-emerald-800" : "border-amber-700/15 bg-amber-50 text-amber-900"}`}>{deadlineVerified ? "Official calendar verified" : "Authority evidence required"}</span>{deadlinePreview.authority?.url ? <a href={deadlinePreview.authority.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[8px] font-semibold text-[#7D5B39] underline underline-offset-2">Revenue Department source <ExternalLink size={9} /></a> : null}</div></div>{deadlinePreview.supported && deadlineVerified ? <div className="mt-3 border-t border-[#A37849]/15 pt-3"><label className="inline-flex items-center gap-2 text-[9px] font-semibold text-[#4A4540]"><input type="checkbox" checked={form.deadline_override_enabled} onChange={event => setForm(current => ({ ...current, deadline_override_enabled: event.target.checked, filing_due_date: event.target.checked ? deadlinePreview.statutory_due_date || "" : "", deadline_override_reason: "", deadline_override_evidence_reference: "" }))} /> Use authority-backed deadline exception</label><div className="mt-1 text-[8px] leading-4 text-[#817B73]">The statutory date is automatic. Only change it when an authority notice or case-specific instruction legally changes this filing.</div></div> : <div className="mt-3 inline-flex items-start gap-2 rounded-lg border border-amber-700/12 bg-white/70 p-2.5 text-[9px] leading-4 text-amber-900"><ShieldAlert size={12} className="mt-0.5 shrink-0" />This due month is not fully verified by Avantiqo’s official calendar set. A human authority confirmation is required now rather than silently trusting a derived date.</div>}{deadlineNeedsEvidence ? <div className="mt-3 grid gap-2 border-t border-[#A37849]/15 pt-3 md:grid-cols-3"><label className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#817B73]">Authority date<input type="date" value={form.deadline_override_enabled || !deadlinePreview.supported ? form.filing_due_date : deadlinePreview.statutory_due_date || ""} disabled={!form.deadline_override_enabled && deadlinePreview.supported} onChange={event => setForm(current => ({ ...current, filing_due_date: event.target.value }))} className="mt-1.5 h-8 w-full rounded-lg border border-black/[0.09] bg-white px-2 text-[9px] disabled:bg-[#F4F1EC] disabled:text-[#8A857D]" /></label><label className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#817B73]">Reason / confirmation<input value={form.deadline_override_reason} onChange={event => setForm(current => ({ ...current, deadline_override_reason: event.target.value }))} placeholder="Why this date is legally valid" className="mt-1.5 h-8 w-full rounded-lg border border-black/[0.09] bg-white px-2 text-[9px] font-normal normal-case tracking-normal" /></label><label className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#817B73]">Authority evidence<input value={form.deadline_override_evidence_reference} onChange={event => setForm(current => ({ ...current, deadline_override_evidence_reference: event.target.value }))} placeholder="Notice / case / source reference" className="mt-1.5 h-8 w-full rounded-lg border border-black/[0.09] bg-white px-2 text-[9px] font-normal normal-case tracking-normal" /></label></div> : null}</div> : <div className="mx-4 mb-4 rounded-xl border border-black/[0.07] bg-[#FAF9F7] p-3 text-[9px] text-[#817B73]">Choose the filing period to preview the governed statutory deadline before creation.</div>}<div className="px-4 pb-4"><textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Optional filing notes…" className="min-h-[68px] w-full rounded-lg border border-black/[0.09] bg-[#FAF9F7] p-2.5 text-[10px] outline-none" /></div><div className="flex justify-end gap-2 border-t border-black/[0.07] p-3"><button onClick={() => setNewMode(false)} className="h-9 rounded-lg border border-black/[0.09] bg-white px-3 text-[10px] font-medium">Cancel</button><button onClick={createReturn} disabled={busy || !deadlinePreview} className="h-9 rounded-lg bg-[#1F1E1B] px-3.5 text-[10px] font-semibold text-white disabled:opacity-40">{busy ? "Creating…" : "Create filing obligation"}</button></div></section> : null}
          <div className="mt-3 grid min-h-[620px] gap-3 xl:grid-cols-[minmax(620px,0.95fr)_minmax(0,1.3fr)]"><section className="overflow-hidden rounded-xl border border-black/[0.07] bg-white"><table className="min-w-full border-collapse text-left text-[10px]"><thead className="border-b border-black/[0.07] bg-[#FAF9F7] text-[9px] font-semibold uppercase tracking-[0.08em] text-[#858078]"><tr><th className="px-3 py-2.5">Period</th><th className="px-3 py-2.5">Jurisdiction</th><th className="px-3 py-2.5">Due</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Payable / refund</th></tr></thead><tbody>{visibleReturns.map(row => { const active = selectedReturn?.id === row.id; return <tr key={row.id} onClick={() => { setSelectedId(row.id); onSelectedVatReturnIdChange?.(row.id); setSubmissionMode(false); }} className={`cursor-pointer border-b border-black/[0.055] ${active ? "bg-[#F5EFE7]" : "hover:bg-[#FAF9F7]"}`}><td className="px-3 py-3"><div className="font-medium">{date(row.period_start)} — {date(row.period_end)}</div><div className="mt-0.5 text-[9px] text-[#979189]">{row.return_number || "Draft filing"}</div></td><td className="px-3 py-3">{row.jurisdiction_code || "—"}</td><td className="px-3 py-3">{date(row.filing_due_date)}</td><td className="px-3 py-3"><span className={`rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.07em] ${stateTone(row.status)}`}>{row.status || "DRAFT"}</span></td><td className="px-3 py-3 text-right font-medium tabular-nums">{Number(row.tax_payable || 0) > 0 ? money(row.tax_payable, row.currency_code || currency) : Number(row.tax_refund || 0) > 0 ? `${money(row.tax_refund, row.currency_code || currency)} refund` : "—"}</td></tr>; })}</tbody></table>{!visibleReturns.length ? <div className="p-10 text-center"><FileCheck2 size={24} className="mx-auto text-[#B6AFA6]" /><div className="mt-3 text-[12px] font-semibold">No VAT filing obligations yet</div><div className="mx-auto mt-1 max-w-sm text-[10px] leading-4 text-[#8A857D]">Create the filing period here; Avantiqo will immediately tell the accountant whether the books are ready to calculate.</div></div> : null}</section>
          <section className="space-y-3">{preflight && selectedReturn ? <><div className="overflow-hidden rounded-xl border border-black/[0.07] bg-white"><div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A7045]">Filing control</div><h2 className="mt-1 text-[18px] font-semibold">{selectedReturn.jurisdiction_code} · {date(selectedReturn.period_start)} — {date(selectedReturn.period_end)}</h2><div className="mt-1 text-[10px] text-[#817B73]">{selectedReturn.registration_reference || "Registration reference missing"}{selectedReturn.return_number ? ` · ${selectedReturn.return_number}` : ""}</div></div><span className={`rounded-md border px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${stateTone(preflight.state)}`}>{humanState(preflight.state)}</span></div><div className="grid grid-cols-2 gap-px border-y border-black/[0.07] bg-black/[0.06] lg:grid-cols-4"><div className="bg-[#FAF9F7] p-3"><div className="text-[9px] text-[#928C84]">Output VAT</div><div className="mt-1 text-[13px] font-semibold tabular-nums">{money(preflight.current?.output_tax, currency)}</div></div><div className="bg-[#FAF9F7] p-3"><div className="text-[9px] text-[#928C84]">Input VAT</div><div className="mt-1 text-[13px] font-semibold tabular-nums">{money(preflight.current?.input_tax, currency)}</div></div><div className="bg-[#FAF9F7] p-3"><div className="text-[9px] text-[#928C84]">Tax payable</div><div className="mt-1 text-[13px] font-semibold tabular-nums">{money(preflight.current?.tax_payable, currency)}</div></div><div className="bg-[#FAF9F7] p-3"><div className="text-[9px] text-[#928C84]">Tax refund</div><div className="mt-1 text-[13px] font-semibold tabular-nums">{money(preflight.current?.tax_refund, currency)}</div></div></div><div className="p-4"><div className="flex items-center justify-between"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#817B73]">Pre-file checks</div><div className="text-[9px] text-[#928C84]">Last calculation {dateTime(preflight.calculated?.at)}</div></div><div className="mt-2 grid gap-2 lg:grid-cols-2">{preflight.checks?.map(item => <div key={item.code} className="rounded-lg border border-black/[0.065] bg-[#FAF9F7] p-2.5"><div className={`flex items-center gap-1.5 text-[10px] font-semibold ${checkTone(item.status)}`}>{checkIcon(item.status)}{item.label}<span className="ml-auto text-[8px] uppercase tracking-[0.08em]">{item.status}</span></div><div className="mt-1.5 text-[9px] leading-4 text-[#777169]">{item.detail}</div></div>)}</div></div><div className="border-t border-black/[0.07] p-3">{upper(selectedReturn.status) === "SUBMITTED" ? <div className="rounded-lg bg-emerald-50 p-3 text-[10px] text-emerald-800"><div className="font-semibold">Filed · {selectedReturn.submission_reference}</div><div className="mt-1">Submitted {dateTime(selectedReturn.submitted_at)}. Submitted filing evidence is immutable in this workspace.</div></div> : <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><button onClick={calculateReturn} disabled={busy || !preflight.ready_to_calculate} className="h-9 rounded-lg border border-black/[0.09] bg-white px-3 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Working…" : preflight.calculation_stale || upper(selectedReturn.status) === "CALCULATED" ? "Recalculate from evidence" : "Calculate from evidence"}</button><button onClick={() => setSubmissionMode(true)} disabled={busy || !preflight.ready_to_submit} className="h-9 rounded-lg bg-[#1F1E1B] px-3.5 text-[10px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Record submission</button></div>}{!preflight.ready_to_calculate && upper(selectedReturn.status) !== "SUBMITTED" ? <div className="mt-2 text-[9px] leading-4 text-red-800">Needs attention before calculation. Avantiqo does not silently repair source transactions here—correct the source workflow, then refresh.</div> : null}</div>{submissionMode && upper(selectedReturn.status) !== "SUBMITTED" ? <div className="border-t border-black/[0.07] bg-[#FAF9F7] p-3"><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#817B73]">Authority evidence</div><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input value={submissionReference} onChange={event => setSubmissionReference(event.target.value)} placeholder="Submission / receipt reference" className="h-9 min-w-0 flex-1 rounded-lg border border-black/[0.09] bg-white px-3 text-[10px] outline-none" /><button onClick={() => setSubmissionMode(false)} className="h-9 rounded-lg border border-black/[0.09] bg-white px-3 text-[10px] font-medium">Cancel</button><button onClick={recordSubmission} disabled={busy || !preflight.ready_to_submit} className="h-9 rounded-lg bg-[#1F1E1B] px-3 text-[10px] font-semibold text-white disabled:opacity-40">Confirm filed</button></div><div className="mt-1.5 text-[9px] text-[#8A857D]">This records external filing evidence; it does not pretend a government connection submitted the return unless such a governed connection exists.</div></div> : null}</div>{preflight.evidence?.exceptions?.length ? <section className="overflow-hidden rounded-xl border border-red-700/15 bg-white"><div className="border-b border-red-700/10 bg-red-50 px-3 py-2.5"><div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-red-800">Needs attention · {preflight.evidence.exception_total}</div></div><div className="divide-y divide-black/[0.055]">{preflight.evidence.exceptions.map((item, index) => <div key={`${item.code}-${item.source_id || index}`} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(150px,.45fr)_minmax(0,1fr)]"><div><div className="text-[9px] font-semibold text-[#3C3834]">{item.reference || item.source_type}</div><div className="text-[8px] uppercase tracking-[0.07em] text-[#99938B]">{item.code}{item.date ? ` · ${date(item.date)}` : ""}</div></div><div className="text-[9px] leading-4 text-[#6F6961]">{item.detail}</div></div>)}</div>{preflight.evidence.exceptions_truncated ? <div className="border-t border-amber-700/15 bg-amber-50 px-3 py-2 text-[9px] text-amber-900">Exception preview is truncated; the preflight still evaluates the full population.</div> : null}</section> : null}<EvidenceTable title="Output VAT · sales" rows={preflight.evidence?.output} total={preflight.evidence?.output_total} truncated={preflight.evidence?.output_truncated} currency={currency} /><EvidenceTable title="Input VAT · purchases" rows={preflight.evidence?.input} total={preflight.evidence?.input_total} truncated={preflight.evidence?.input_truncated} currency={currency} /></> : <div className="rounded-xl border border-black/[0.07] bg-white p-10 text-center text-[11px] text-[#8A857D]">Create or select a VAT filing obligation to inspect its governed evidence.</div>}</section></div>
        </>}
      </div>
      <WorkspaceEventHub organizationId={organizationId} entityId={entityId} periodId={periodId} />
    </main>
  );
}
