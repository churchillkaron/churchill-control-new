"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  MapPin,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SprayCan,
  UserRound,
} from "lucide-react";

const TERMINAL = new Set(["complete", "completed", "cancelled", "canceled", "archived"]);
const ACTIVE = new Set(["start", "started", "in_progress"]);
const EXTERNAL_TYPES = new Set(["photo", "signature", "file"]);
const SEVERITIES = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["critical", "Critical"]];
const NEXT_ACTIONS = [["monitor", "Monitor"], ["revisit", "Revisit"], ["remediate", "Remediate"], ["quote", "Prepare quote"], ["escalate", "Escalate"], ["customer_action", "Customer action"]];

function text(value) { return String(value ?? "").trim(); }
function normalized(value) { return text(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function dateValue(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }
function formatTime(value) { const date = dateValue(value); return date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"; }
function formatDate(value) { const date = dateValue(value); return date ? date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "No date"; }
function isToday(value) { const date = dateValue(value); if (!date) return false; const now = new Date(); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate(); }
function isTerminal(row) { return TERMINAL.has(normalized(row?.work_order_status)) || normalized(row?.occurrence_status) === "completed"; }
function isStarted(row) { return ACTIVE.has(normalized(row?.work_order_status)) || Boolean(row?.staff_execution?.started_at) || Boolean(row?.staff_execution?.started?.at); }
function protocolFields(row) { return Array.isArray(row?.execution_protocol?.field_schema) ? row.execution_protocol.field_schema : []; }
function valuePresent(value, field) { if (field?.type === "checkbox") return value === true; if (value === 0) return true; return value !== undefined && value !== null && text(value) !== ""; }
function completionEvidenceId(row) { return text(row?.completion?.completion_evidence_id || row?.latest_completion_evidence_id || row?.staff_execution?.completed?.completion_evidence_id); }
function externalProofRequired(row) {
  const evidence = row?.execution_protocol?.evidence_requirements || {};
  return protocolFields(row).some((field) => field?.required && EXTERNAL_TYPES.has(normalized(field.type))) || Object.values(evidence).some(Boolean);
}
function evidenceLabels(requirements = {}) {
  const labels = { before_photos: "Before photos", after_photos: "After photos", customer_signature: "Customer signature", technician_signature: "Technician signature", location_confirmation: "Location confirmation" };
  return Object.entries(requirements).filter(([, required]) => Boolean(required)).map(([key]) => labels[key] || key.replaceAll("_", " "));
}
function statusPresentation(row) {
  if (isTerminal(row)) return { label: "Completed", tone: "border-[#748267]/18 bg-[#748267]/[0.06] text-[#607057]" };
  if (isStarted(row)) return { label: "On site", tone: "border-[#9A744B]/20 bg-[#9A744B]/[0.07] text-[#7B5D3E]" };
  if (!row?.assigned_to) return { label: "Unassigned", tone: "border-[#B36B52]/20 bg-[#B36B52]/[0.07] text-[#98513D]" };
  if (!row?.execution_protocol) return { label: "Protocol missing", tone: "border-[#B36B52]/20 bg-[#B36B52]/[0.07] text-[#98513D]" };
  return { label: "Ready to arrive", tone: "border-black/[0.07] bg-[#F7F6F3] text-[#77736C]" };
}

function fieldInput(field, value, onChange, disabled) {
  const base = "mt-1.5 w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[11px] text-[#312E2A] outline-none transition focus:border-[#D6A66A]/60 disabled:cursor-not-allowed disabled:bg-[#F4F2EE] disabled:text-[#A09A92]";
  const type = normalized(field.type);
  if (type === "textarea") return <textarea disabled={disabled} className={`${base} min-h-24 resize-y`} value={value || ""} onChange={(event) => onChange(event.target.value)} />;
  if (type === "select") return <select disabled={disabled} className={base} value={value || ""} onChange={(event) => onChange(event.target.value)}><option value="">Select…</option>{(field.options || []).map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}</select>;
  if (type === "checkbox") return <label className={`mt-2 flex min-h-10 items-center gap-2 rounded-xl border border-black/[0.08] px-3 text-[10px] ${disabled ? "bg-[#F4F2EE] text-[#A09A92]" : "bg-white text-[#5E5952]"}`}><input disabled={disabled} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /> Confirmed</label>;
  if (type === "number" || type === "measurement") return <div className="relative"><input disabled={disabled} className={base} type="number" step="any" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} />{field.unit ? <span className="pointer-events-none absolute right-3 top-[15px] text-[8px] text-[#99948C]">{field.unit}</span> : null}</div>;
  if (type === "date") return <input disabled={disabled} className={base} type="date" value={value || ""} onChange={(event) => onChange(event.target.value)} />;
  if (type === "datetime") return <input disabled={disabled} className={base} type="datetime-local" value={value || ""} onChange={(event) => onChange(event.target.value)} />;
  return <input disabled={disabled} className={base} type="text" value={value || ""} onChange={(event) => onChange(event.target.value)} />;
}

function QueueCard({ row, selected, onSelect }) {
  const presentation = statusPresentation(row);
  return <button type="button" onClick={onSelect} className={`w-full rounded-2xl border p-4 text-left transition ${selected ? "border-[#D6A66A]/45 bg-[#FFFDF9] shadow-[0_8px_30px_rgba(63,48,32,0.06)]" : "border-black/[0.07] bg-white hover:border-black/[0.13]"}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-[12px] font-medium text-[#2E2A26]">{row.customer_name || "Customer"}</div><div className="mt-0.5 truncate text-[9px] text-[#8E8880]">{row.service_name || row.name || "Service visit"}</div></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[7px] font-medium uppercase tracking-[0.06em] ${presentation.tone}`}>{presentation.label}</span></div>
    <div className="mt-3 flex items-center gap-3 text-[8px] text-[#817B73]"><span className="flex items-center gap-1"><Clock3 size={9} />{formatTime(row.scheduled_start || row.occurrence_at)}</span><span className="min-w-0 flex items-center gap-1"><MapPin size={9} /><span className="truncate">{row.customer_location_name || "Site not named"}</span></span></div>
    <div className="mt-3 flex items-center justify-between border-t border-black/[0.05] pt-2.5 text-[8px] text-[#969087]"><span>{row.execution_protocol ? `${row.execution_protocol.name || "Protocol"} v${row.execution_protocol.version || 1}` : "No protocol"}</span><ChevronRight size={10} /></div>
  </button>;
}

function Step({ number, label, ready, active, detail }) {
  return <div className={`rounded-xl border px-3 py-2.5 ${active ? "border-[#D6A66A]/35 bg-[#D6A66A]/[0.06]" : ready ? "border-[#748267]/16 bg-[#748267]/[0.04]" : "border-black/[0.06] bg-white"}`}><div className="flex items-center gap-2"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-medium ${ready ? "bg-[#748267] text-white" : active ? "bg-[#D6A66A] text-[#2C2925]" : "bg-[#EEEAE4] text-[#8D877F]"}`}>{ready ? "✓" : number}</span><div className="min-w-0"><div className={`truncate text-[9px] font-medium ${active ? "text-[#76583A]" : "text-[#5F5952]"}`}>{label}</div><div className="mt-0.5 truncate text-[7px] text-[#9A938A]">{detail}</div></div></div></div>;
}

function Gate({ label, ready, detail }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-3 text-[9px]"><span className="text-[#6D675F]">{label}</span><span className={ready ? "text-[#607057]" : "text-[#98513D]"}>{detail}</span></div>;
}

export default function PestControlTechnicianCockpit({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", rows: [] });
  const [filter, setFilter] = useState("today");
  const [selectedId, setSelectedId] = useState("");
  const [responses, setResponses] = useState({});
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [monitoring, setMonitoring] = useState({ loading: false, error: "", round: null });
  const [exception, setException] = useState({ loading: false, error: "", record: null });
  const [exceptionDraft, setExceptionDraft] = useState({ outcome: "issue_found", severity: "medium", nextAction: "revisit", summary: "" });

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (!silent) setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/technician?organizationId=${encodeURIComponent(organizationId)}&limit=500`, { cache: "no-store", credentials: "include" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Technician service queue could not be loaded.");
      const rows = Array.isArray(json.rows) ? json.rows : [];
      const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const requestedOccurrenceId = params?.get("occurrenceId") || null;
      const requestedWorkOrderId = params?.get("workOrderId") || null;
      const requested = rows.find((row) => (requestedOccurrenceId && row.occurrence_id === requestedOccurrenceId) || (requestedWorkOrderId && row.work_order_id === requestedWorkOrderId)) || null;
      setState({ loading: false, error: "", rows });
      if (requested) { setFilter("all"); setSelectedId(requested.occurrence_id); }
      else setSelectedId((current) => current && rows.some((row) => row.occurrence_id === current) ? current : rows.find((row) => !isTerminal(row))?.occurrence_id || rows[0]?.occurrence_id || "");
    } catch (error) { setState((current) => ({ ...current, loading: false, error: error?.message || "Technician service queue could not be loaded." })); }
  }, [organizationId]);

  const selected = useMemo(() => state.rows.find((row) => row.occurrence_id === selectedId) || null, [selectedId, state.rows]);

  const loadMonitoring = useCallback(async (row) => {
    if (!organizationId || !row?.occurrence_id || normalized(row.industry_key) !== "pest_control") { setMonitoring({ loading: false, error: "", round: null }); return; }
    setMonitoring((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/monitoring-round?organizationId=${encodeURIComponent(organizationId)}&occurrenceId=${encodeURIComponent(row.occurrence_id)}`, { cache: "no-store", credentials: "include" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Monitoring coverage could not be loaded.");
      setMonitoring({ loading: false, error: "", round: json.round || null });
    } catch (error) { setMonitoring({ loading: false, error: error?.message || "Monitoring coverage could not be loaded.", round: null }); }
  }, [organizationId]);

  const loadException = useCallback(async (row) => {
    if (!organizationId || !row?.occurrence_id) { setException({ loading: false, error: "", record: null }); return; }
    setException((current) => ({ ...current, loading: true, error: "" }));
    try {
      const params = new URLSearchParams({ organizationId, occurrenceId: row.occurrence_id });
      if (row.work_order_id) params.set("workOrderId", row.work_order_id);
      const response = await fetch(`/api/service-management/visit-exception?${params.toString()}`, { cache: "no-store", credentials: "include" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Site exception could not be loaded.");
      const record = json.service_exception || null;
      setException({ loading: false, error: "", record });
      setExceptionDraft(record?.active ? { outcome: record.outcome || "issue_found", severity: record.severity || "medium", nextAction: record.next_action || "revisit", summary: record.summary || "" } : { outcome: "issue_found", severity: "medium", nextAction: "revisit", summary: "" });
    } catch (error) { setException({ loading: false, error: error?.message || "Site exception could not be loaded.", record: null }); }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!selected) return;
    const submission = selected.staff_execution?.protocol_submission || {};
    setResponses(submission.responses && typeof submission.responses === "object" ? submission.responses : {});
    setNotice("");
    loadMonitoring(selected);
    loadException(selected);
  }, [selectedId, loadMonitoring, loadException]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const refreshOnReturn = () => { load({ silent: true }); if (selected) { loadMonitoring(selected); loadException(selected); } };
    window.addEventListener("focus", refreshOnReturn);
    return () => window.removeEventListener("focus", refreshOnReturn);
  }, [load, loadMonitoring, loadException, selected]);

  function selectVisit(row) {
    setSelectedId(row.occurrence_id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("occurrenceId", row.occurrence_id);
      if (row.work_order_id) url.searchParams.set("workOrderId", row.work_order_id);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  const filteredRows = useMemo(() => filter === "all" ? state.rows : filter === "active" ? state.rows.filter((row) => !isTerminal(row)) : state.rows.filter((row) => isToday(row.scheduled_start || row.occurrence_at) && !isTerminal(row)), [filter, state.rows]);
  const protocol = selected?.execution_protocol || null;
  const fields = protocolFields(selected);
  const ordinaryFields = fields.filter((field) => !EXTERNAL_TYPES.has(normalized(field.type)));
  const externalFields = fields.filter((field) => EXTERNAL_TYPES.has(normalized(field.type)));
  const requiredFields = ordinaryFields.filter((field) => field.required);
  const completedRequired = requiredFields.filter((field) => valuePresent(responses[field.key], field)).length;
  const protocolReady = Boolean(protocol) && completedRequired === requiredFields.length;
  const visitStarted = Boolean(selected && isStarted(selected));
  const treatment = selected?.treatment_readiness || null;
  const treatmentReady = Boolean(treatment?.ready);
  const monitoringReady = !monitoring.loading && !monitoring.error && monitoring.round?.completion_ready === true;
  const evidenceId = completionEvidenceId(selected);
  const proofRequired = selected ? externalProofRequired(selected) : false;
  const proofReady = !proofRequired || Boolean(evidenceId);
  const exceptionRecord = exception.record;
  const exceptionReady = !exceptionRecord?.active || exceptionRecord.completion_ready === true;
  const completionReady = visitStarted && protocolReady && treatmentReady && monitoringReady && proofReady && exceptionReady && !isTerminal(selected);
  const status = statusPresentation(selected || {});
  const canStart = Boolean(selected?.allowed_commands?.includes("start") && selected?.assigned_to && protocol && !visitStarted && !isTerminal(selected));
  const treatmentHref = selected?.occurrence_id ? `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/treatment/${encodeURIComponent(selected.occurrence_id)}` : "#";
  const monitoringHref = selected?.occurrence_id ? `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/monitoring-round/${encodeURIComponent(selected.occurrence_id)}` : "#";
  const evidenceHref = selected?.occurrence_id ? `/workspace/${encodeURIComponent(organizationId)}/operations/completion-evidence/${encodeURIComponent(selected.occurrence_id)}` : "#";
  const workControlHref = selected?.work_order_id ? `/workspace/${encodeURIComponent(organizationId)}/operations/work-control?workOrderId=${encodeURIComponent(selected.work_order_id)}` : `/workspace/${encodeURIComponent(organizationId)}/operations/work-control`;

  async function execute(action) {
    if (!selected || busy) return;
    setBusy(action); setNotice("");
    try {
      if (action === "complete") await loadException(selected);
      const response = await fetch("/api/service-management/technician", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, occurrenceId: selected.occurrence_id, action, responses, outcome: "completed", completionEvidenceId: evidenceId || null }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || `Service could not be ${action === "start" ? "started" : "completed"}.`);
      setNotice(action === "start" ? "Arrival confirmed. Work is now open for this exact visit." : json.reconciliation?.follow_up_work_request_id ? "Visit completed. The saved site exception created a linked follow-up automatically." : "Visit completed and reconciled. Service history and proof are now authoritative.");
      await load({ silent: true });
      if (action === "start") { await loadMonitoring(selected); await loadException(selected); }
    } catch (error) { setNotice(error?.message || "Technician action failed."); if (action === "complete") { await loadMonitoring(selected); await loadException(selected); } }
    finally { setBusy(""); }
  }

  async function saveException(action) {
    if (!selected || busy) return;
    if (action === "record" && exceptionDraft.summary.trim().length < 8) { setNotice("Describe what happened and what needs to happen next before saving the site exception."); return; }
    setBusy(`exception-${action}`); setNotice("");
    try {
      const response = await fetch("/api/service-management/visit-exception", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, occurrenceId: selected.occurrence_id, workOrderId: selected.work_order_id, action, outcome: exceptionDraft.outcome, severity: exceptionDraft.severity, nextAction: exceptionDraft.nextAction, summary: exceptionDraft.summary }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Site exception could not be saved.");
      const record = json.service_exception || null;
      setException({ loading: false, error: "", record });
      if (action === "clear") setExceptionDraft({ outcome: "issue_found", severity: "medium", nextAction: "revisit", summary: "" });
      setNotice(action === "clear" ? "Site exception cleared. This visit can close normally when the other gates are ready." : record?.evidence_ready ? "Site exception saved with proof. Completion will create the follow-up automatically." : "Site exception saved. Capture occurrence-bound evidence before completing the visit.");
    } catch (error) { setNotice(error?.message || "Site exception could not be saved."); }
    finally { setBusy(""); }
  }

  const evidence = evidenceLabels(protocol?.evidence_requirements || {});
  const activeStep = !visitStarted ? 1 : !protocolReady || !treatmentReady ? 2 : !monitoringReady ? 3 : !proofReady ? 4 : !exceptionReady ? 5 : 6;

  return <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7">
    <div className="mx-auto max-w-[1680px]">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-5"><div><Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service`} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E]"><ArrowLeft size={10} /> Pest Control</Link><div className="mt-3 text-[9px] font-medium uppercase tracking-[0.16em] text-[#9A744B]">Technician execution</div><h1 className="mt-1 text-[28px] font-medium tracking-[-0.04em]">Service on site</h1><p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">One visit, one work path. Context follows automatically from arrival through treatment, proof, exceptions and completion.</p></div><div className="flex gap-2">{selected?.work_order_id ? <Link href={workControlHref} className="rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] px-3.5 py-2.5 text-[9px] text-[#725434]">Work control</Link> : null}<button onClick={() => { load(); if (selected) { loadMonitoring(selected); loadException(selected); } }} className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[9px]"><RefreshCw size={10} className={state.loading || monitoring.loading || exception.loading ? "animate-spin" : ""} />Refresh</button></div></header>
      {state.error ? <div className="mt-4 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]">{state.error}</div> : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)] xl:items-start">
        <aside className="xl:sticky xl:top-5"><div className="rounded-2xl border border-black/[0.075] bg-white p-3"><div className="flex items-center justify-between px-1 pb-3"><div><div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">My service visits</div><div className="mt-0.5 text-[8px] text-[#A09A92]">Choose the visit you are physically working</div></div><span className="text-[12px] font-medium">{filteredRows.length}</span></div><div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-[#F4F2EE] p-1">{[["today", "Today"], ["active", "Active"], ["all", "All"]].map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-lg px-2 py-2 text-[8px] font-medium ${filter === value ? "bg-white text-[#5C4935] shadow-sm" : "text-[#8D877F]"}`}>{label}</button>)}</div><div className="space-y-2">{filteredRows.map((row) => <QueueCard key={row.occurrence_id} row={row} selected={row.occurrence_id === selectedId} onSelect={() => selectVisit(row)} />)}{!state.loading && filteredRows.length === 0 ? <div className="rounded-xl bg-[#FBFAF8] px-4 py-7 text-center text-[9px] text-[#8D877F]">No visits in this view.</div> : null}</div></div></aside>

        {!selected ? <section className="rounded-2xl border border-black/[0.075] bg-white px-5 py-16 text-center text-[11px] text-[#817A72]">Select a service visit to begin.</section> : <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white">
          <div className="border-b border-black/[0.06] px-5 py-5 md:px-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#9A744B]">{formatDate(selected.scheduled_start || selected.occurrence_at)} · {formatTime(selected.scheduled_start || selected.occurrence_at)}–{formatTime(selected.scheduled_end || selected.due_at)}</div><h2 className="mt-1.5 text-[22px] font-medium tracking-[-0.035em]">{selected.customer_name || "Customer"}</h2><div className="mt-1 text-[11px] text-[#777169]">{selected.service_name || selected.name || "Service visit"}</div></div><span className={`rounded-full border px-2.5 py-1.5 text-[8px] font-medium uppercase tracking-[0.07em] ${status.tone}`}>{status.label}</span></div><div className="mt-4 grid gap-2.5 sm:grid-cols-3"><div className="rounded-xl bg-[#FBFAF8] p-3"><div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.08em] text-[#99938B]"><MapPin size={9} /> Site</div><div className="mt-1.5 text-[10px] font-medium">{selected.customer_location_name || "Site not named"}</div></div><div className="rounded-xl bg-[#FBFAF8] p-3"><div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.08em] text-[#99938B]"><UserRound size={9} /> Technician</div><div className="mt-1.5 text-[10px] font-medium">{selected.preferred_staff_name || (selected.assigned_to ? "Assigned technician" : "Unassigned")}</div></div><div className="rounded-xl bg-[#FBFAF8] p-3"><div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.08em] text-[#99938B]"><ShieldCheck size={9} /> Protocol</div><div className="mt-1.5 text-[10px] font-medium">{protocol ? `${protocol.name || "Treatment protocol"} · v${protocol.version || 1}` : "Missing"}</div></div></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-6"><Step number="1" label="Arrive" ready={visitStarted || isTerminal(selected)} active={activeStep === 1} detail={visitStarted ? "On site" : "Confirm arrival"} /><Step number="2" label="Inspect & treat" ready={protocolReady && treatmentReady} active={activeStep === 2} detail={treatmentReady ? "Treatment ready" : "Record treatment"} /><Step number="3" label="Monitoring" ready={monitoringReady} active={activeStep === 3} detail={monitoringReady ? "Coverage complete" : `${monitoring.round?.pending_required_points || 0} pending`} /><Step number="4" label="Evidence" ready={proofReady} active={activeStep === 4} detail={proofReady ? "Proof ready" : "Capture proof"} /><Step number="5" label="Exception" ready={exceptionReady} active={activeStep === 5} detail={exceptionRecord?.active ? (exceptionReady ? "Issue documented" : "Needs proof") : "None recorded"} /><Step number="6" label="Complete" ready={isTerminal(selected)} active={activeStep === 6} detail={completionReady ? "Ready to close" : "Waiting"} /></div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_315px]"><div className="space-y-6 p-5 md:p-6">
            <section className={`rounded-2xl border p-4 ${visitStarted || isTerminal(selected) ? "border-[#748267]/16 bg-[#748267]/[0.035]" : "border-[#D6A66A]/24 bg-[#D6A66A]/[0.045]"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">1 · Arrival</div><h3 className="mt-1 text-[15px] font-medium">{visitStarted || isTerminal(selected) ? "You are checked in to this visit" : "Confirm you are at the customer site"}</h3><p className="mt-1 text-[9px] leading-4 text-[#817A72]">Arrival opens treatment recording for this exact customer, site and occurrence.</p></div>{!visitStarted && !isTerminal(selected) ? <button disabled={!canStart || busy === "start"} onClick={() => execute("start")} className="inline-flex items-center gap-1.5 rounded-xl bg-[#2C2925] px-4 py-3 text-[10px] font-medium text-white disabled:opacity-35"><Play size={10} />{busy === "start" ? "Checking in…" : "I’m here · start visit"}</button> : <span className="inline-flex items-center gap-1.5 rounded-full border border-[#748267]/18 bg-white px-3 py-1.5 text-[8px] font-medium text-[#607057]"><CheckCircle2 size={9} /> On site</span>}</div>{!selected.assigned_to && !visitStarted ? <div className="mt-3 text-[8px] text-[#98513D]">This visit needs an assigned technician before arrival.</div> : null}</section>

            <section className="border-t border-black/[0.06] pt-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">2 · Inspect & treat</div><h3 className="mt-1 text-[15px] font-medium">Follow the service protocol</h3></div><Link href={treatmentHref} className={`inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] font-medium ${visitStarted ? "text-[#665B4E]" : "pointer-events-none text-[#B2ACA4]"}`}><SprayCan size={10} /> Treatment record</Link></div><div className={`mt-3 rounded-xl border p-3.5 ${treatmentReady ? "border-[#748267]/18 bg-[#748267]/[0.04]" : "border-[#C08A4A]/20 bg-[#C08A4A]/[0.035]"}`}><div className="flex items-center justify-between gap-3"><span className="text-[9px] font-medium">Treatment record</span><span className={treatmentReady ? "text-[8px] text-[#607057]" : "text-[8px] text-[#98513D]"}>{treatmentReady ? `${treatment.finding_count || 0} finding(s) · ${treatment.application_count || 0} application(s)` : treatment?.status === "draft" ? "Needs details" : "Not recorded"}</span></div>{!treatmentReady && treatment?.issues?.length ? <div className="mt-2 text-[8px] leading-4 text-[#8D806F]">{treatment.issues.slice(0, 2).join(" ")}</div> : null}</div>{ordinaryFields.length ? <div className="mt-3 grid gap-3 md:grid-cols-2">{ordinaryFields.map((field) => <label key={field.key} className={`rounded-xl border p-3.5 ${field.required && !valuePresent(responses[field.key], field) ? "border-[#C08A4A]/20 bg-[#C08A4A]/[0.035]" : "border-black/[0.06] bg-[#FBFAF8]"}`}><div className="flex items-start justify-between gap-2"><span className="text-[10px] font-medium text-[#4A4540]">{field.label || field.key}</span>{field.required ? <span className="text-[7px] uppercase tracking-[0.06em] text-[#9A744B]">Required</span> : null}</div>{field.help_text ? <div className="mt-0.5 text-[8px] leading-3 text-[#99938C]">{field.help_text}</div> : null}{fieldInput(field, responses[field.key], (value) => setResponses((current) => ({ ...current, [field.key]: value })), !visitStarted || isTerminal(selected))}</label>)}</div> : null}</section>

            <section className="border-t border-black/[0.06] pt-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">3 · Monitoring</div><h3 className="mt-1 text-[15px] font-medium">Cover the points due at this site</h3></div><Link href={monitoringHref} className={`rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] font-medium ${visitStarted ? "text-[#665B4E]" : "pointer-events-none text-[#B2ACA4]"}`}>Open monitoring round</Link></div>{monitoring.error ? <div className="mt-3 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] p-3 text-[9px] text-[#8B4937]">{monitoring.error}</div> : <div className={`mt-3 rounded-xl border p-4 ${monitoringReady ? "border-[#748267]/18 bg-[#748267]/[0.04]" : "border-[#C08A4A]/20 bg-[#C08A4A]/[0.035]"}`}><div className="flex items-center justify-between"><span className="text-[10px] font-medium">{monitoring.round?.checked_required_points || 0}/{monitoring.round?.required_points || 0} required points checked</span><span className={monitoringReady ? "text-[8px] text-[#607057]" : "text-[8px] text-[#98513D]"}>{monitoringReady ? "Ready" : `${monitoring.round?.pending_required_points || 0} pending`}</span></div></div>}</section>

            <section className="border-t border-black/[0.06] pt-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">4 · Evidence</div><h3 className="mt-1 text-[15px] font-medium">Prove the service once</h3></div><Link href={evidenceHref} className={`rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] font-medium ${visitStarted ? "text-[#665B4E]" : "pointer-events-none text-[#B2ACA4]"}`}>{proofReady ? "Review evidence" : "Capture evidence"}</Link></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{[...evidence, ...externalFields.map((field) => field.label || field.key)].filter(Boolean).map((label) => <div key={label} className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-[#FBFAF8] px-3 py-3 text-[9px] text-[#625D56]"><FileCheck2 size={10} className="text-[#9A744B]" />{label}</div>)}{!proofRequired ? <div className="flex items-center gap-2 rounded-xl border border-[#748267]/15 bg-[#748267]/[0.04] px-3 py-3 text-[9px] text-[#65705D]"><CheckCircle2 size={10} />No extra proof required by this protocol.</div> : null}</div>{proofRequired ? <div className={`mt-3 rounded-xl border p-3 ${proofReady ? "border-[#748267]/18 bg-[#748267]/[0.04] text-[#607057]" : "border-[#C08A4A]/20 bg-[#C08A4A]/[0.035] text-[#76583A]"}`}>{proofReady ? `Governed evidence ${evidenceId.slice(0, 8)} is linked to this visit.` : "Completion remains locked until occurrence-bound proof is ready."}</div> : null}</section>

            <section className="border-t border-black/[0.06] pt-5"><div className="flex items-start gap-3"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${exceptionRecord?.active ? "bg-[#C08A4A]/10 text-[#8A6039]" : "bg-[#F4F2EE] text-[#777169]"}`}><ShieldAlert size={14} /></div><div><div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">5 · Site exception</div><h3 className="mt-1 text-[15px] font-medium">Only record something when the normal service did not solve it</h3><p className="mt-1 text-[9px] leading-4 text-[#817A72]">One structured exception becomes the follow-up. Do not enter the same issue again at completion.</p></div></div>{exception.error ? <div className="mt-3 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] p-3 text-[9px] text-[#8B4937]">{exception.error}</div> : null}<div className="mt-3 grid gap-3 md:grid-cols-[145px_145px_180px_minmax(240px,1fr)]"><label className="text-[8px] text-[#5B554E]">Decision<select disabled={!visitStarted || isTerminal(selected)} value={exceptionDraft.outcome} onChange={(event) => setExceptionDraft((current) => ({ ...current, outcome: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-2.5 text-[10px] disabled:bg-[#F1EFEA]"><option value="issue_found">Issue found</option><option value="follow_up">Follow-up needed</option></select></label><label className="text-[8px] text-[#5B554E]">Severity<select disabled={!visitStarted || isTerminal(selected)} value={exceptionDraft.severity} onChange={(event) => setExceptionDraft((current) => ({ ...current, severity: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-2.5 text-[10px] disabled:bg-[#F1EFEA]">{SEVERITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-[8px] text-[#5B554E]">What should happen next?<select disabled={!visitStarted || isTerminal(selected)} value={exceptionDraft.nextAction} onChange={(event) => setExceptionDraft((current) => ({ ...current, nextAction: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-2.5 text-[10px] disabled:bg-[#F1EFEA]">{NEXT_ACTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-[8px] text-[#5B554E]">What happened?<input disabled={!visitStarted || isTerminal(selected)} value={exceptionDraft.summary} onChange={(event) => setExceptionDraft((current) => ({ ...current, summary: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-2.5 text-[10px] disabled:bg-[#F1EFEA]" placeholder="Example: Active termite trail at rear store; revisit and treat entry point." /></label></div><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className={`text-[8px] ${exceptionRecord?.active && !exceptionReady ? "text-[#98513D]" : "text-[#777169]"}`}>{exceptionRecord?.active ? exceptionReady ? "Exception is complete and will create the linked follow-up when this visit closes." : "Exception is saved but still needs governed evidence." : "No exception recorded. If nothing unusual happened, leave this section empty and complete the visit normally."}</div><div className="flex gap-2">{exceptionRecord?.active ? <button disabled={!visitStarted || isTerminal(selected) || busy === "exception-clear"} onClick={() => saveException("clear")} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px]">Clear exception</button> : null}<button disabled={!visitStarted || isTerminal(selected) || exceptionDraft.summary.trim().length < 8 || busy === "exception-record"} onClick={() => saveException("record")} className="rounded-lg bg-[#2C2925] px-3 py-2 text-[9px] font-medium text-white disabled:opacity-35">{busy === "exception-record" ? "Saving…" : exceptionRecord?.active ? "Update exception" : "Record exception"}</button></div></div></section>
          </div>

          <aside className="border-t border-black/[0.06] bg-[#FBFAF8] p-5 lg:border-l lg:border-t-0"><div className="lg:sticky lg:top-5"><div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]"><ClipboardCheck size={10} /> Ready to complete?</div><div className="mt-3 space-y-2"><Gate label="Arrival" ready={visitStarted || isTerminal(selected)} detail={visitStarted || isTerminal(selected) ? "Ready" : "Not started"} /><Gate label="Protocol questions" ready={protocolReady} detail={`${completedRequired}/${requiredFields.length}`} /><Gate label="Treatment record" ready={treatmentReady} detail={treatmentReady ? "Ready" : "Missing / incomplete"} /><Gate label="Monitoring" ready={monitoringReady} detail={monitoringReady ? "Ready" : monitoring.error ? "Unavailable" : `${monitoring.round?.pending_required_points || 0} pending`} /><Gate label="Required proof" ready={proofReady} detail={proofReady ? "Ready" : "Missing"} /><Gate label="Site exception" ready={exceptionReady} detail={exceptionRecord?.active ? exceptionReady ? "Documented" : "Incomplete" : "None"} /></div><div className="mt-4 rounded-xl border border-black/[0.06] bg-white p-3.5 text-[8px] leading-4 text-[#837C73]">There is no separate outcome form. If a site issue exists, record it once in Site exception. Otherwise completion means the service was completed as planned.</div>{notice ? <div className={`mt-3 rounded-xl border px-3.5 py-3 text-[9px] leading-4 ${/required|cannot|incomplete|failed|missing/i.test(notice) ? "border-[#B36B52]/20 bg-[#B36B52]/[0.05] text-[#8B4937]" : "border-[#748267]/18 bg-[#748267]/[0.05] text-[#607057]"}`}>{notice}</div> : null}<button disabled={!completionReady || busy === "complete"} onClick={() => execute("complete")} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2C2925] px-4 py-3.5 text-[10px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-35"><CheckCircle2 size={12} />{busy === "complete" ? "Completing…" : isTerminal(selected) ? "Service completed" : "Complete this visit"}</button>{!completionReady && !isTerminal(selected) ? <div className="mt-2 text-center text-[8px] leading-3 text-[#9C958D]">Finish the items marked above. Avantiqo will not close an incomplete visit.</div> : null}</div></aside>
          </div>
        </section>}
      </div>
    </div>
  </main>;
}