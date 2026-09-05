"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, ExternalLink, FileSearch2, RefreshCw, ShieldCheck } from "lucide-react";

async function requestJson(url) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
}

function sourceLabel(value) {
  return String(value || "Evidence").replaceAll("_", " ").toLowerCase().replace(/^./, char => char.toUpperCase());
}

function DuplicateReview({ source }) {
  const records = Array.isArray(source?.duplicate_records) ? source.duplicate_records : [];
  if (records.length < 2) return null;
  return <div className="mt-3 rounded-lg border border-amber-700/10 bg-[#FFF9F0] p-2.5">
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="text-[7px] font-semibold uppercase tracking-[0.09em] text-amber-900">Potential duplicate group</div><div className="mt-0.5 text-[9px] text-[#5F5952]">Compare all {records.length} VAT-bearing purchase documents before filing.</div></div>
      <div className="text-[8px] text-[#918B83]">Review only · live accounting truth clears the warning</div>
    </div>
    <div className="mt-2 grid gap-2 xl:grid-cols-2">{records.map(record => {
      const navigation = record.source_navigation || null;
      const tax = money(record.tax_amount);
      return <div key={record.id} className="rounded-lg border border-black/[0.06] bg-white p-2.5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[9px] font-semibold">{record.reference || record.id}</div><div className="mt-0.5 text-[8px] text-[#817B73]">{date(record.date)} · {record.status || "—"}{record.approval_status ? ` · ${record.approval_status}` : ""}</div></div><div className="shrink-0 text-right text-[8px] text-[#817B73]">{tax ? <div className="font-semibold text-[#5F5952]">VAT {tax}</div> : null}<div>{record.vat_line_count || 0} VAT line{record.vat_line_count === 1 ? "" : "s"}</div></div></div>
        <div className="mt-2 flex flex-col gap-2 rounded-md bg-[#FAF9F7] px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0 text-[7px] leading-3 text-[#817B73]"><span className="font-mono">{record.id}</span>{record.posting_journal ? <span className="ml-2">Journal {record.posting_journal.reference || record.posting_journal.id} · {record.posting_journal.status || "—"}{record.posting_journal.reversed ? " · reversed" : ""}</span> : <span className="ml-2">No linked posting journal</span>}</div>{navigation?.href ? <a href={navigation.href} className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 text-[7px] font-semibold text-[#4E4943]">Open this invoice <ArrowUpRight size={8}/></a> : <span className="text-[7px] font-semibold text-[#918B83]">No direct source route</span>}</div>
      </div>;
    })}</div>
  </div>;
}

function DeadlineReview({ evidence, issue, onOpenCalendar }) {
  if (!evidence) return null;
  const blocking = issue?.severity === "BLOCK";
  const authorityControl = issue?.code === "TAX_CALENDAR_AUTHORITY";
  const verified = evidence.verification_status === "OFFICIAL_CALENDAR_VERIFIED";
  const manualJurisdiction = evidence.verification_status === "MANUAL_JURISDICTION_REQUIRED";
  const hasOverrideEvidence = Boolean(evidence.override);
  const hasHumanEvidence = Boolean(evidence.human_confirmation);
  const acceptedOverride = hasOverrideEvidence && !blocking;
  const acceptedHumanEvidence = hasHumanEvidence && !blocking;
  const recordedMatchesStatutory = Boolean(evidence.recorded_due_date && evidence.statutory_due_date && evidence.recorded_due_date === evidence.statutory_due_date);
  const statusLabel = blocking
    ? manualJurisdiction
      ? "Authority evidence required"
      : !evidence.recorded_due_date
        ? "Governed deadline missing"
        : evidence.statutory_due_date && !recordedMatchesStatutory
          ? "Recorded date conflicts with policy"
          : !verified
            ? "Official confirmation required"
            : "Filing authority unresolved"
    : acceptedOverride
      ? "Controlled authority override"
      : verified
        ? "Official authority calendar"
        : acceptedHumanEvidence
          ? "Human-confirmed authority evidence"
          : authorityControl
            ? "Authority confirmation required"
            : "Governed calendar context";
  const authority = evidence.authority || null;
  const adjustment = evidence.adjustment || null;

  return <div className={`mt-3 overflow-hidden rounded-lg border ${blocking ? "border-red-700/15 bg-red-50/30" : "border-[#A37849]/15 bg-[#FFF9F0]"}`}>
    <div className={`flex flex-col gap-2 border-b px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between ${blocking ? "border-red-700/12" : "border-[#A37849]/12"}`}>
      <div>
        <div className={`inline-flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.09em] ${blocking ? "text-red-800" : "text-[#8A633E]"}`}><CalendarClock size={9}/> {authorityControl ? "Statutory authority control" : "Statutory deadline evidence"}</div>
        <div className="mt-1 text-[10px] font-semibold text-[#403B36]">Why this deadline</div>
        <div className="mt-0.5 text-[8px] leading-4 text-[#817B73]">{blocking ? "This is the same governed calendar resolution used by live Tax preflight. This control cannot be cleared in Evidence; filing stays blocked until live Tax preflight accepts the deadline authority." : "This is the same governed calendar resolution used by live Tax preflight. Evidence review does not recalculate or acknowledge the deadline."}</div>
      </div>
      <span className={`shrink-0 rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] ${blocking ? "border-red-700/15 bg-red-50 text-red-800" : acceptedOverride || !verified ? "border-amber-700/15 bg-amber-50 text-amber-900" : "border-emerald-700/15 bg-emerald-50 text-emerald-800"}`}>{statusLabel}</span>
    </div>

    {blocking ? <div className="border-b border-red-700/10 bg-red-50 px-3 py-2 text-[8px] leading-4 text-red-900"><b>Filing blocked:</b> {issue?.detail || "Live Tax preflight has not accepted the statutory deadline authority."}</div> : null}

    <div className="grid gap-px bg-[#A37849]/10 sm:grid-cols-3">
      <div className="bg-white/80 p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Recorded filing date</div><div className="mt-1 text-[11px] font-semibold text-[#3F3A35]">{date(evidence.recorded_due_date)}</div><div className="mt-0.5 text-[7px] text-[#918B83]">Current filing record</div></div>
      <div className="bg-white/80 p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Governed statutory date</div><div className="mt-1 text-[11px] font-semibold text-[#3F3A35]">{evidence.statutory_due_date ? date(evidence.statutory_due_date) : manualJurisdiction ? "Authority date required" : "—"}</div><div className="mt-0.5 text-[7px] text-[#918B83]">{evidence.filing_channel_label || evidence.filing_channel || "Filing method"}</div></div>
      <div className="bg-white/80 p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Legal clock</div><div className={`mt-1 text-[11px] font-semibold ${evidence.overdue ? "text-red-800" : "text-[#3F3A35]"}`}>{date(evidence.legal_date)}</div><div className="mt-0.5 text-[7px] text-[#918B83]">{evidence.legal_time_zone || "Jurisdiction time"}{evidence.overdue ? " · overdue" : ""}</div></div>
    </div>

    <div className="grid gap-2 p-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
      <div className="rounded-lg border border-black/[0.05] bg-white/75 p-2.5">
        <div className="grid gap-2 sm:grid-cols-3">
          <div><div className="text-[7px] uppercase tracking-[0.08em] text-[#968F87]">Base filing date</div><div className="mt-1 text-[9px] font-semibold">{date(evidence.base_due_date)}</div></div>
          <div><div className="text-[7px] uppercase tracking-[0.08em] text-[#968F87]">Authority-adjusted date</div><div className="mt-1 text-[9px] font-semibold">{evidence.statutory_due_date ? date(evidence.statutory_due_date) : manualJurisdiction ? "Manual authority evidence" : "—"}</div></div>
          <div><div className="text-[7px] uppercase tracking-[0.08em] text-[#968F87]">Return period</div><div className="mt-1 text-[9px] font-semibold">to {date(evidence.period_end)}</div></div>
        </div>
        <div className="mt-2 text-[8px] leading-4 text-[#817B73]">{evidence.form_label || evidence.form_code || "VAT return"} · {evidence.filing_channel_label || evidence.filing_channel || "filing method"}{manualJurisdiction ? " · no automated statutory calendar for this jurisdiction" : adjustment?.applied ? ` · authority calendar moved the base date ${adjustment.days} day${adjustment.days === 1 ? "" : "s"} (${String(adjustment.reason || "").replaceAll("_", " ").toLowerCase()})` : " · no authority date adjustment"}.</div>
      </div>

      <div className="rounded-lg border border-black/[0.05] bg-white/75 p-2.5">
        <div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Authority lineage</div>
        <div className="mt-1 text-[9px] font-semibold text-[#4E4943]">{authority?.authority || (manualJurisdiction ? "Manual authority evidence required" : "Tax authority evidence")}</div>
        <div className="mt-0.5 text-[8px] leading-4 text-[#817B73]">{authority?.title || (manualJurisdiction ? `No automated ${evidence.jurisdiction_code || "jurisdiction"} statutory calendar` : evidence.policy_version || "Governed statutory calendar")}{authority?.calendar_last_reviewed ? ` · reviewed ${date(authority.calendar_last_reviewed)}` : ""}</div>
        {authority?.url ? <a href={authority.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[8px] font-semibold text-[#7D5B39] underline underline-offset-2">Revenue Department source <ExternalLink size={8}/></a> : null}
      </div>
    </div>

    {hasOverrideEvidence ? <div className="mx-3 mb-3 rounded-lg border border-amber-700/12 bg-amber-50/70 px-2.5 py-2 text-[8px] leading-4 text-amber-900"><b>{blocking ? "Recorded override evidence · not accepted by live preflight:" : "Controlled override:"}</b> {evidence.override.reason || "Reason recorded"} · evidence {evidence.override.evidence_reference || "required"}</div> : hasHumanEvidence ? <div className="mx-3 mb-3 rounded-lg border border-amber-700/12 bg-amber-50/70 px-2.5 py-2 text-[8px] leading-4 text-amber-900"><b>{blocking ? "Recorded authority evidence · not accepted by live preflight:" : "Authority confirmation:"}</b> {evidence.human_confirmation.reason || "Confirmation recorded"} · evidence {evidence.human_confirmation.evidence_reference || "required"}</div> : blocking && manualJurisdiction ? <div className="mx-3 mb-3 rounded-lg border border-red-700/12 bg-red-50 px-2.5 py-2 text-[8px] leading-4 text-red-900"><b>Required proof:</b> record the authority-confirmed filing date together with a reason and authority evidence reference in the governed filing calendar.</div> : null}

    <div className={`flex flex-col gap-2 border-t bg-white/55 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${blocking ? "border-red-700/12" : "border-[#A37849]/12"}`}>
      <div className={`text-[8px] ${blocking ? "font-semibold text-red-800" : "text-[#817B73]"}`}>{blocking ? "Blocking · filing remains unavailable until live Tax preflight accepts the authority evidence." : "Review only · live Tax truth decides whether this warning remains."}</div>
      {typeof onOpenCalendar === "function" ? <button type="button" onClick={onOpenCalendar} className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md bg-[#1F1E1B] px-2.5 text-[8px] font-semibold text-white">{blocking ? "Fix deadline authority" : "Review filing method & deadline"} <ArrowUpRight size={9}/></button> : null}
    </div>
  </div>;
}

function EvidenceRecord({ issue, onOpenCalendar }) {
  const source = issue.source_record || null;
  const line = issue.tax_line || null;
  const rule = issue.tax_rule || null;
  const journal = issue.posting_journal || null;
  const target = issue.workspace_target || null;
  const navigation = issue.source_navigation || null;
  const calendarEvidence = issue.calendar_evidence || null;

  return <div className="rounded-lg border border-black/[0.07] bg-white p-3">
    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] ${issue.severity === "WARNING" ? "border-amber-700/15 bg-amber-50 text-amber-900" : "border-red-700/15 bg-red-50 text-red-800"}`}>{issue.severity === "WARNING" ? "Review" : "Blocking evidence"}</span>
          <span className="rounded-md border border-black/[0.06] bg-[#F7F6F3] px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] text-[#716B63]">{sourceLabel(issue.source_type)}</span>
          <span className="text-[8px] text-[#918B83]">{issue.code}</span>
        </div>
        <div className="mt-2 text-[11px] font-semibold">{issue.reference || issue.source_id || "Governed evidence"}</div>
        <div className="mt-1 text-[9px] leading-4 text-[#716B63]">{issue.detail}</div>
      </div>
      <div className="shrink-0 text-right text-[8px] leading-4 text-[#918B83]">
        <div>{date(issue.date)}</div>
        {money(issue.amount) ? <div className="font-semibold text-[#5F5952]">Tax amount {money(issue.amount)}</div> : null}
      </div>
    </div>

    <DuplicateReview source={source}/>
    <DeadlineReview evidence={calendarEvidence} issue={issue} onOpenCalendar={onOpenCalendar}/>

    {!calendarEvidence ? <>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg bg-[#FAF9F7] p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Source document</div><div className="mt-1 text-[8px] leading-4 text-[#4E4943]">{source ? <>{source.reference || source.id}<br/>Status {source.status || "—"}{source.approval_status ? ` · ${source.approval_status}` : ""}{source.currency_code ? <><br/>{source.currency_code} · rate {source.exchange_rate ?? "missing"}</> : null}</> : "Context evidence"}</div></div>
        <div className="rounded-lg bg-[#FAF9F7] p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Tax line</div><div className="mt-1 text-[8px] leading-4 text-[#4E4943]">{line ? <>Line {line.line_number ?? line.id ?? "—"}<br/>Tax {money(line.tax_amount) || "—"}{line.tax_rule_id ? <><br/>Rule {line.tax_rule_id}</> : null}</> : "No line-level record for this blocker"}</div></div>
        <div className="rounded-lg bg-[#FAF9F7] p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Governed VAT rule</div><div className="mt-1 text-[8px] leading-4 text-[#4E4943]">{rule ? <>{rule.tax_code || rule.id} · {rule.tax_rate ?? "—"}%<br/>{rule.is_active ? "Active" : "Inactive"} · {date(rule.effective_from)} → {date(rule.effective_to)}</> : "Missing or not applicable"}</div></div>
        <div className="rounded-lg bg-[#FAF9F7] p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#968F87]">Posting proof</div><div className="mt-1 text-[8px] leading-4 text-[#4E4943]">{journal ? <>{journal.reference || journal.id}<br/>{journal.status || "—"}{journal.reversed ? " · reversed" : " · not reversed"}</> : "No linked posting evidence"}</div></div>
      </div>

      <div className="mt-2 flex flex-col gap-2 rounded-lg border border-black/[0.05] bg-[#FAF9F7] px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-[8px] text-[#817B73]"><span className="font-mono">{issue.source_id || "context"}</span><span className="ml-2">{target ? `Exact ${String(target.workspace).replaceAll("_", " ")} record · Business Context stays fixed` : "Governed context evidence"}</span></div>
        {navigation?.href ? <a href={navigation.href} className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md bg-[#1F1E1B] px-2.5 text-[8px] font-semibold text-white">Open exact source <ArrowUpRight size={9}/></a> : <span className="shrink-0 text-[8px] font-semibold text-[#918B83]">No direct source route</span>}
      </div>
    </> : null}
  </div>;
}

function EvidenceControlSelector({ dependencies, selectedCode, onSelect }) {
  const blocking = dependencies.filter(item => item.blocking === true);
  const reviewOnly = dependencies.filter(item => item.blocking !== true);
  if (!dependencies.length) return null;

  return <div className="grid gap-px border-b border-black/[0.07] bg-black/[0.05] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
    <div className="min-w-0 bg-[#FAF9F7] p-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-red-800">Blocking · {blocking.length}</div>
        <div className="text-[7px] text-[#918B83]">Must clear before filing</div>
      </div>
      <div className="mt-1.5 flex gap-1.5 overflow-x-auto">
        {blocking.length ? blocking.map((item, index) => <button key={item.code} type="button" onClick={() => onSelect(item.code)} className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[8px] font-semibold ${item.code === selectedCode ? "border-red-800/20 bg-red-50 text-red-800" : "border-black/[0.07] bg-white text-[#5F5952]"}`}>{index === 0 ? "Next required · " : ""}{item.title} · {item.evidence_count || 0}</button>) : <span className="rounded-lg border border-emerald-700/12 bg-emerald-50 px-2.5 py-1.5 text-[8px] font-semibold text-emerald-800">No live blockers</span>}
      </div>
    </div>
    <div className="min-w-0 bg-white p-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-amber-900">Review only · {reviewOnly.length}</div>
        <div className="text-[7px] text-[#918B83]">Does not block filing</div>
      </div>
      <div className="mt-1.5 flex gap-1.5 overflow-x-auto">
        {reviewOnly.length ? reviewOnly.map(item => <button key={item.code} type="button" onClick={() => onSelect(item.code)} className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[8px] font-semibold ${item.code === selectedCode ? "border-[#A37849]/25 bg-[#FFF9F0] text-[#76583A]" : "border-black/[0.07] bg-white text-[#716B63]"}`}>{item.title} · {item.evidence_count || 0}</button>) : <span className="px-1 py-1.5 text-[8px] text-[#918B83]">No review-only controls</span>}
      </div>
    </div>
  </div>;
}

export default function FinanceTaxEvidenceDrilldownRail({ organizationId, entityId, selectedVatReturnId, focusDependencyCode = null, onStageChange = null }) {
  const [guidanceState, setGuidanceState] = useState({ loading: false, error: "", guidance: null });
  const [selectedCode, setSelectedCode] = useState(null);
  const [evidenceState, setEvidenceState] = useState({ loading: false, error: "", body: null });
  const pageSize = 25;

  async function loadGuidance() {
    if (!organizationId || !entityId || !selectedVatReturnId) return;
    try {
      setGuidanceState(current => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/finance/vat-returns/dependency-work", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      url.searchParams.set("vatReturnId", selectedVatReturnId);
      const body = await requestJson(url.toString());
      if (body.return_id !== selectedVatReturnId || body.resolution_authority !== "LIVE_TAX_PREFLIGHT_ONLY") throw new Error("Tax evidence inspector could not verify the selected filing and resolution authority.");
      const dependencies = body.guidance?.dependencies || [];
      const requestedFocus = String(focusDependencyCode || "").trim().toUpperCase();
      setGuidanceState({ loading: false, error: "", guidance: body.guidance || null });
      setSelectedCode(current => {
        if (requestedFocus && dependencies.some(item => item.code === requestedFocus)) return requestedFocus;
        if (dependencies.some(item => item.code === current)) return current;
        return dependencies.find(item => item.blocking === true)?.code || dependencies[0]?.code || null;
      });
    } catch (error) {
      setGuidanceState({ loading: false, error: error?.message || "Tax evidence dependencies could not be loaded", guidance: null });
      setSelectedCode(null);
    }
  }

  async function loadEvidence(code = selectedCode, offset = 0) {
    if (!organizationId || !entityId || !selectedVatReturnId || !code) return;
    try {
      setEvidenceState(current => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/finance/vat-returns/evidence-drilldown", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      url.searchParams.set("vatReturnId", selectedVatReturnId);
      url.searchParams.set("dependencyCode", code);
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("limit", String(pageSize));
      const body = await requestJson(url.toString());
      if (body.return_id !== selectedVatReturnId || body.entity_id !== entityId) throw new Error("Tax evidence inspector returned a different filing scope.");
      if (body.resolution_authority !== "LIVE_TAX_PREFLIGHT_ONLY" || body.mutation_authority !== false || body.context_mutation_authority !== false) throw new Error("Tax evidence inspector returned unsafe authority.");
      setEvidenceState({ loading: false, error: "", body });
    } catch (error) {
      setEvidenceState({ loading: false, error: error?.message || "Tax evidence could not be loaded", body: null });
    }
  }

  useEffect(() => {
    setGuidanceState({ loading: false, error: "", guidance: null });
    setSelectedCode(null);
    setEvidenceState({ loading: false, error: "", body: null });
    loadGuidance();
  }, [organizationId, entityId, selectedVatReturnId, focusDependencyCode]);

  useEffect(() => {
    setEvidenceState({ loading: false, error: "", body: null });
    if (selectedCode) loadEvidence(selectedCode, 0);
  }, [selectedCode]);

  const dependencies = guidanceState.guidance?.dependencies || [];
  const selected = useMemo(() => dependencies.find(item => item.code === selectedCode) || null, [dependencies, selectedCode]);
  if (!organizationId || !entityId || !selectedVatReturnId) return null;
  if (!guidanceState.loading && !guidanceState.error && dependencies.length === 0) return null;

  const body = evidenceState.body;
  const population = body?.population || null;
  const offset = population?.offset || 0;
  const first = population?.total ? offset + 1 : 0;
  const last = population?.total ? offset + (population.returned || 0) : 0;
  const openCalendar = typeof onStageChange === "function" ? () => onStageChange("RETURN") : null;

  return <section className="mx-auto mt-3 max-w-[1760px] px-4 sm:px-5 lg:px-6">
    <div className="overflow-hidden rounded-xl border border-black/[0.07] bg-white text-[#2A2723]">
      <div className="flex flex-col gap-3 border-b border-black/[0.07] p-3.5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A7045]"><FileSearch2 size={11}/> VAT evidence trace</span><span className="rounded-md border border-black/[0.07] bg-[#F7F6F3] px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] text-[#716B63]">Read only · full population</span></div>
          <div className="mt-1 text-[12px] font-semibold">Start with the VAT control, then trace it to exact governed evidence.</div>
          <div className="mt-1 max-w-4xl text-[9px] leading-4 text-[#817B73]">Choose the live VAT control below. Avantiqo rebuilds the complete filing population or reuses the governed statutory authority context, and keeps the legal entity and filing context fixed while you inspect the evidence. Viewing evidence never switches Business Context.</div>
        </div>
        <button type="button" onClick={loadGuidance} className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px] font-semibold"><RefreshCw size={10} className={guidanceState.loading ? "animate-spin" : ""}/> Refresh truth</button>
      </div>

      {guidanceState.error ? <div className="m-3 rounded-lg border border-red-700/15 bg-red-50 p-2.5 text-[9px] text-red-800">{guidanceState.error}</div> : null}

      <div className="grid gap-px border-b border-black/[0.07] bg-black/[0.05] lg:grid-cols-3">
        <div className="bg-white p-3"><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#9A7045]">1 · VAT control</div><div className="mt-1 text-[10px] font-semibold">Choose what needs proof</div><div className="mt-1 text-[8px] leading-4 text-[#817B73]">Only controls that still exist in live Tax truth appear here.</div></div>
        <div className="bg-white p-3"><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#9A7045]">2 · Source population</div><div className="mt-1 text-[10px] font-semibold">Review every affected record</div><div className="mt-1 text-[8px] leading-4 text-[#817B73]">Pagination is only presentation; transaction controls use the complete filing population and authority controls use the governed statutory context.</div></div>
        <div className="bg-white p-3"><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#9A7045]">3 · Exact source</div><div className="mt-1 text-[10px] font-semibold">Open the governing evidence</div><div className="mt-1 text-[8px] leading-4 text-[#817B73]">Open the exact accounting record or return to the governed filing calendar without changing Business Context.</div></div>
      </div>

      <EvidenceControlSelector dependencies={dependencies} selectedCode={selectedCode} onSelect={setSelectedCode}/>

      {selected ? <div className="grid gap-px border-b border-black/[0.07] bg-black/[0.05] lg:grid-cols-3">
        <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Selected VAT control</div><div className="mt-1 flex flex-wrap items-center gap-1.5"><span className="text-[10px] font-semibold">{selected.title}</span><span className={`rounded-md border px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.06em] ${selected.blocking ? "border-red-700/15 bg-red-50 text-red-800" : "border-amber-700/15 bg-amber-50 text-amber-900"}`}>{selected.blocking ? "Blocking" : "Review only"}</span></div><div className="mt-0.5 text-[8px] text-[#918B83]">{selected.code}</div></div>
        <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">{selected.blocking ? "Next required action" : "Review action"}</div><div className="mt-1 text-[9px] leading-4 text-[#4E4943]">{selected.next_action}</div></div>
        <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Resolution proof</div><div className="mt-1 text-[9px] leading-4 text-[#4E4943]">{selected.resolution_rule}</div></div>
      </div> : null}

      {evidenceState.error ? <div className="m-3 rounded-lg border border-red-700/15 bg-red-50 p-2.5 text-[9px] text-red-800">{evidenceState.error}</div> : null}
      {evidenceState.loading && !body ? <div className="p-4 text-[9px] text-[#817B73]">Re-evaluating full filing population…</div> : null}

      {body ? <>
        <div className="flex flex-col gap-2 border-b border-black/[0.07] px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div className="text-[8px] text-[#817B73]"><strong className="text-[#5F5952]">{population?.complete ? "Complete live population" : "Governed context evidence"}</strong> · showing {first}–{last} of {population?.total || 0} · source {String(body.source || "").replaceAll("_", " ").toLowerCase()}</div><div className="flex items-center gap-1.5"><button type="button" disabled={offset <= 0 || evidenceState.loading} onClick={() => loadEvidence(selectedCode, Math.max(0, offset - pageSize))} className="inline-flex h-7 items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 text-[8px] font-semibold disabled:opacity-30"><ChevronLeft size={9}/> Previous</button><button type="button" disabled={!population?.has_more || evidenceState.loading} onClick={() => loadEvidence(selectedCode, offset + pageSize)} className="inline-flex h-7 items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 text-[8px] font-semibold disabled:opacity-30">Next <ChevronRight size={9}/></button></div></div>
        <div className="space-y-2 bg-[#FAF9F7] p-3">{body.issues?.length ? body.issues.map((issue, index) => <EvidenceRecord key={`${issue.code}:${issue.source_id || "context"}:${issue.tax_line?.id || index}`} issue={issue} onOpenCalendar={openCalendar}/>) : <div className="flex items-start gap-2 rounded-lg border border-emerald-700/15 bg-emerald-50 p-3 text-[9px] text-emerald-800"><ShieldCheck size={12} className="mt-0.5"/><div><b>No evidence row remains for this blocker page.</b> Refresh live Tax truth; the dependency may have changed while the inspector was open.</div></div>}</div>
        <div className="border-t border-black/[0.07] bg-white px-3.5 py-2.5 text-[8px] leading-4 text-[#817B73]">Resolution authority remains live Tax preflight only. Evidence inspection is read-only; it cannot post, recode, alter FX, update a VAT rule, complete work, or mutate Business Context.</div>
      </> : null}
    </div>
  </section>;
}
