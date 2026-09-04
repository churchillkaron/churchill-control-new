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
  ShieldCheck,
  UserRound,
} from "lucide-react";

const TERMINAL = new Set(["complete", "completed", "cancelled", "canceled", "archived"]);
const EXTERNAL_TYPES = new Set(["photo", "signature", "file"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value) {
  const date = dateValue(value);
  if (!date) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value) {
  const date = dateValue(value);
  if (!date) return "No date";
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function isToday(value) {
  const date = dateValue(value);
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function isTerminal(row) {
  return TERMINAL.has(normalized(row?.work_order_status))
    || normalized(row?.occurrence_status) === "completed";
}

function protocolFields(row) {
  return Array.isArray(row?.execution_protocol?.field_schema)
    ? row.execution_protocol.field_schema
    : [];
}

function externalProofRequired(row) {
  const fields = protocolFields(row);
  const evidence = row?.execution_protocol?.evidence_requirements || {};
  return fields.some((field) => field?.required && EXTERNAL_TYPES.has(normalized(field.type)))
    || Object.values(evidence).some(Boolean);
}

function completionEvidenceId(row) {
  return text(
    row?.completion?.completion_evidence_id
    || row?.staff_execution?.completed?.completion_evidence_id,
  );
}

function statusPresentation(row) {
  const status = normalized(row?.work_order_status);
  if (isTerminal(row)) return { label: "Completed", tone: "border-[#748267]/18 bg-[#748267]/[0.06] text-[#607057]" };
  if (status === "start" || status === "started" || status === "in_progress") return { label: "On site", tone: "border-[#9A744B]/20 bg-[#9A744B]/[0.07] text-[#7B5D3E]" };
  if (!row?.assigned_to) return { label: "Unassigned", tone: "border-[#B36B52]/20 bg-[#B36B52]/[0.07] text-[#98513D]" };
  if (!row?.execution_protocol) return { label: "Protocol missing", tone: "border-[#B36B52]/20 bg-[#B36B52]/[0.07] text-[#98513D]" };
  return { label: "Ready", tone: "border-black/[0.07] bg-[#F7F6F3] text-[#77736C]" };
}

function evidenceLabels(requirements = {}) {
  const labels = {
    before_photos: "Before photos",
    after_photos: "After photos",
    customer_signature: "Customer signature",
    technician_signature: "Technician signature",
    location_confirmation: "Location confirmation",
  };
  return Object.entries(requirements)
    .filter(([, required]) => Boolean(required))
    .map(([key]) => labels[key] || key.replaceAll("_", " "));
}

function valuePresent(value, field) {
  if (field?.type === "checkbox") return value === true;
  if (value === 0) return true;
  return value !== undefined && value !== null && text(value) !== "";
}

function fieldInput(field, value, onChange) {
  const base = "mt-1.5 w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[12px] text-[#312E2A] outline-none transition focus:border-[#D6A66A]/60";
  const type = normalized(field.type);

  if (type === "textarea") {
    return <textarea className={`${base} min-h-24 resize-y`} value={value || ""} onChange={(event) => onChange(event.target.value)} />;
  }
  if (type === "select") {
    return (
      <select className={base} value={value || ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select…</option>
        {(field.options || []).map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
      </select>
    );
  }
  if (type === "checkbox") {
    return (
      <label className="mt-2 flex min-h-10 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[11px] text-[#5E5952]">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /> Confirmed
      </label>
    );
  }
  if (type === "number" || type === "measurement") {
    return (
      <div className="relative">
        <input className={base} type="number" step="any" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} />
        {field.unit ? <span className="pointer-events-none absolute right-3 top-[15px] text-[9px] text-[#99948C]">{field.unit}</span> : null}
      </div>
    );
  }
  if (type === "date") return <input className={base} type="date" value={value || ""} onChange={(event) => onChange(event.target.value)} />;
  if (type === "datetime") return <input className={base} type="datetime-local" value={value || ""} onChange={(event) => onChange(event.target.value)} />;
  return <input className={base} type="text" value={value || ""} onChange={(event) => onChange(event.target.value)} />;
}

function QueueCard({ row, selected, onSelect }) {
  const presentation = statusPresentation(row);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition ${selected ? "border-[#D6A66A]/45 bg-[#FFFDF9] shadow-[0_8px_30px_rgba(63,48,32,0.06)]" : "border-black/[0.07] bg-white hover:border-black/[0.13]"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-[#2E2A26]">{row.customer_name || "Customer"}</div>
          <div className="mt-0.5 truncate text-[9px] text-[#8E8880]">{row.service_name || row.name || "Service visit"}</div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[7px] font-medium uppercase tracking-[0.06em] ${presentation.tone}`}>{presentation.label}</span>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[8px] text-[#817B73]">
        <span className="flex items-center gap-1"><Clock3 size={9} /> {formatTime(row.scheduled_start || row.occurrence_at)}</span>
        <span className="min-w-0 flex items-center gap-1"><MapPin size={9} /><span className="truncate">{row.customer_location_name || "Site not named"}</span></span>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-black/[0.05] pt-2.5 text-[8px] text-[#969087]">
        <span>{row.execution_protocol ? `${row.execution_protocol.name || "Protocol"} v${row.execution_protocol.version || 1}` : "No protocol"}</span>
        <ChevronRight size={10} />
      </div>
    </button>
  );
}

export default function PestControlTechnicianCockpit({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", rows: [] });
  const [filter, setFilter] = useState("today");
  const [selectedId, setSelectedId] = useState("");
  const [responses, setResponses] = useState({});
  const [outcome, setOutcome] = useState("completed");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [monitoring, setMonitoring] = useState({ loading: false, error: "", round: null });

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (!silent) setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/technician?organizationId=${encodeURIComponent(organizationId)}&limit=500`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Technician service queue could not be loaded.");
      const rows = Array.isArray(json.rows) ? json.rows : [];
      setState({ loading: false, error: "", rows });
      setSelectedId((current) => current || rows.find((row) => !isTerminal(row))?.occurrence_id || rows[0]?.occurrence_id || "");
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Technician service queue could not be loaded." }));
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const selected = useMemo(
    () => state.rows.find((row) => row.occurrence_id === selectedId) || null,
    [selectedId, state.rows],
  );

  const loadMonitoring = useCallback(async (row) => {
    if (!organizationId || !row?.occurrence_id || normalized(row.industry_key) !== "pest_control") {
      setMonitoring({ loading: false, error: "", round: null });
      return;
    }
    setMonitoring((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/monitoring-round?organizationId=${encodeURIComponent(organizationId)}&occurrenceId=${encodeURIComponent(row.occurrence_id)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Monitoring preflight could not be loaded.");
      setMonitoring({ loading: false, error: "", round: json.round || null });
    } catch (error) {
      setMonitoring({ loading: false, error: error?.message || "Monitoring preflight could not be loaded.", round: null });
    }
  }, [organizationId]);

  useEffect(() => {
    if (!selected) return;
    const submission = selected.staff_execution?.protocol_submission || {};
    setResponses(submission.responses && typeof submission.responses === "object" ? submission.responses : {});
    setOutcome(normalized(submission.outcome) || "completed");
    setFollowUpNotes(submission.follow_up_notes || "");
    setEvidenceId(completionEvidenceId(selected));
    setNotice("");
    loadMonitoring(selected);
  }, [selectedId, loadMonitoring]);

  const filteredRows = useMemo(() => {
    if (filter === "all") return state.rows;
    if (filter === "active") return state.rows.filter((row) => !isTerminal(row));
    return state.rows.filter((row) => isToday(row.scheduled_start || row.occurrence_at) && !isTerminal(row));
  }, [filter, state.rows]);

  const protocol = selected?.execution_protocol || null;
  const fields = protocolFields(selected);
  const ordinaryFields = fields.filter((field) => !EXTERNAL_TYPES.has(normalized(field.type)));
  const externalFields = fields.filter((field) => EXTERNAL_TYPES.has(normalized(field.type)));
  const requiredFields = ordinaryFields.filter((field) => field.required);
  const completedRequired = requiredFields.filter((field) => valuePresent(responses[field.key], field)).length;
  const evidence = evidenceLabels(protocol?.evidence_requirements || {});
  const proofRequired = selected ? externalProofRequired(selected) : false;
  const proofReady = !proofRequired || Boolean(text(evidenceId));
  const protocolReady = Boolean(protocol) && completedRequired === requiredFields.length;
  const monitoringApplicable = normalized(selected?.industry_key) === "pest_control";
  const monitoringReady = !monitoringApplicable || (!monitoring.loading && !monitoring.error && monitoring.round?.completion_ready === true);
  const completionReady = protocolReady && proofReady && monitoringReady && !isTerminal(selected);
  const status = statusPresentation(selected || {});

  function updateResponse(key, value) {
    setResponses((current) => ({ ...current, [key]: value }));
  }

  async function execute(action) {
    if (!selected || busy) return;
    setBusy(action);
    setNotice("");
    try {
      const response = await fetch("/api/service-management/technician", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          occurrenceId: selected.occurrence_id,
          action,
          responses,
          outcome,
          followUpNotes,
          completionEvidenceId: text(evidenceId) || null,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || `Service could not be ${action === "start" ? "started" : "completed"}.`);
      setNotice(action === "start"
        ? "Service started. The visit is now in controlled on-site execution."
        : json.reconciliation?.follow_up_work_request_id
          ? "Service completed and reconciled. Follow-up work was created automatically."
          : "Service completed and reconciled. Customer service proof is now authoritative.");
      await load({ silent: true });
      if (action === "start") await loadMonitoring(selected);
    } catch (error) {
      setNotice(error?.message || "Technician action failed.");
      if (action === "complete") await loadMonitoring(selected);
    } finally {
      setBusy("");
    }
  }

  const evidenceHref = `/workspace/${encodeURIComponent(organizationId)}/operations/completion-evidence`;
  const reportsHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/service-reports`;
  const fieldServiceHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service`;
  const monitoringHref = selected?.occurrence_id
    ? `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/monitoring-round/${encodeURIComponent(selected.occurrence_id)}`
    : `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/monitoring-rounds`;

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7">
      <div className="mx-auto max-w-[1680px]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-5">
          <div>
            <Link href={fieldServiceHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E] hover:text-[#79593A]"><ArrowLeft size={10} /> Pest Control</Link>
            <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Technician execution</div>
            <h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em] text-[#201E1B]">Service on site</h1>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">One controlled path from arrival to inspection, treatment, monitoring, proof and customer-safe completion.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={reportsHref} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] text-[#625D56]">Service reports</Link>
            <button type="button" onClick={() => { load(); if (selected) loadMonitoring(selected); }} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143]" aria-label="Refresh technician queue">
              <RefreshCw size={11} className={state.loading || monitoring.loading ? "animate-spin" : ""} />
            </button>
          </div>
        </header>

        {state.error ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]"><AlertTriangle size={12} className="mt-0.5" />{state.error}</div> : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)] xl:items-start">
          <aside className="xl:sticky xl:top-5">
            <div className="rounded-2xl border border-black/[0.075] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              <div className="flex items-center justify-between gap-2 px-1 pb-3">
                <div>
                  <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">Service queue</div>
                  <div className="mt-0.5 text-[8px] text-[#A09A92]">Commitments ready for technician execution</div>
                </div>
                <span className="text-[12px] font-medium text-[#3A3631]">{filteredRows.length}</span>
              </div>
              <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-[#F4F2EE] p-1">
                {[['today','Today'],['active','Active'],['all','All']].map(([value,label]) => (
                  <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-2 py-2 text-[8px] font-medium ${filter === value ? "bg-white text-[#5C4935] shadow-sm" : "text-[#8D877F]"}`}>{label}</button>
                ))}
              </div>
              <div className="space-y-2">
                {!state.loading && filteredRows.length === 0 ? <div className="rounded-xl bg-[#FBFAF8] px-4 py-6 text-center text-[9px] text-[#8D877F]">No visits in this view.</div> : null}
                {filteredRows.map((row) => <QueueCard key={row.occurrence_id} row={row} selected={row.occurrence_id === selectedId} onSelect={() => setSelectedId(row.occurrence_id)} />)}
              </div>
            </div>
          </aside>

          {!selected ? (
            <section className="rounded-2xl border border-black/[0.075] bg-white px-5 py-16 text-center text-[11px] text-[#817A72]">Select a service visit to open technician execution.</section>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              <div className="border-b border-black/[0.06] px-5 py-5 md:px-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#9A744B]">{formatDate(selected.scheduled_start || selected.occurrence_at)} · {formatTime(selected.scheduled_start || selected.occurrence_at)}–{formatTime(selected.scheduled_end || selected.due_at)}</div>
                    <h2 className="mt-1.5 truncate text-[22px] font-medium tracking-[-0.035em] text-[#27231F]">{selected.customer_name || "Customer"}</h2>
                    <div className="mt-1 text-[11px] text-[#777169]">{selected.service_name || selected.name || "Service visit"}</div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1.5 text-[8px] font-medium uppercase tracking-[0.07em] ${status.tone}`}>{status.label}</span>
                </div>

                <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                  <div className="rounded-xl bg-[#FBFAF8] p-3"><div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.08em] text-[#99938B]"><MapPin size={9} /> Site</div><div className="mt-1.5 text-[10px] font-medium text-[#49443E]">{selected.customer_location_name || "Site not named"}</div></div>
                  <div className="rounded-xl bg-[#FBFAF8] p-3"><div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.08em] text-[#99938B]"><UserRound size={9} /> Technician</div><div className="mt-1.5 text-[10px] font-medium text-[#49443E]">{selected.preferred_staff_name || (selected.assigned_to ? `Assigned · ${text(selected.assigned_to).slice(0,8)}` : "Unassigned")}</div></div>
                  <div className="rounded-xl bg-[#FBFAF8] p-3"><div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.08em] text-[#99938B]"><ShieldCheck size={9} /> Protocol</div><div className="mt-1.5 text-[10px] font-medium text-[#49443E]">{protocol ? `${protocol.name || "Treatment protocol"} · v${protocol.version || 1}` : "Missing"}</div></div>
                </div>
              </div>

              <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_310px]">
                <div className="p-5 md:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">1 · Arrive & understand</div>
                      <h3 className="mt-1 text-[15px] font-medium text-[#322E29]">Site instructions</h3>
                    </div>
                    {!isTerminal(selected) ? <button type="button" disabled={busy === "start"} onClick={() => execute("start")} className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] px-3 py-2 text-[9px] font-medium text-[#76583A] disabled:opacity-40"><Play size={9} />{busy === "start" ? "Starting…" : "Start service"}</button> : null}
                  </div>
                  <div className="mt-3 rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-4 text-[10px] leading-5 text-[#6F6961]">{protocol?.instructions || selected.description || "No additional site instruction is attached to this visit."}</div>

                  <div className="mt-6 border-t border-black/[0.06] pt-5">
                    <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">2 · Inspect & treat</div>
                    <div className="mt-1 flex items-end justify-between gap-3"><h3 className="text-[15px] font-medium text-[#322E29]">Treatment protocol</h3><span className="text-[8px] text-[#99938C]">{completedRequired}/{requiredFields.length} required complete</span></div>

                    {!protocol ? <div className="mt-3 flex gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] p-4 text-[10px] leading-4 text-[#8B4937]"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Completion is governed off because this visit has no snapshotted treatment protocol.</div> : null}

                    {ordinaryFields.length ? <div className="mt-3 grid gap-3 md:grid-cols-2">{ordinaryFields.map((field) => (
                      <label key={field.key} className={`rounded-xl border p-3.5 ${field.required && !valuePresent(responses[field.key], field) ? "border-[#C08A4A]/20 bg-[#C08A4A]/[0.035]" : "border-black/[0.06] bg-[#FBFAF8]"}`}>
                        <div className="flex items-start justify-between gap-2"><span className="text-[10px] font-medium text-[#4A4540]">{field.label || field.key}</span>{field.required ? <span className="text-[7px] uppercase tracking-[0.06em] text-[#9A744B]">Required</span> : null}</div>
                        {field.help_text ? <div className="mt-0.5 text-[8px] leading-3 text-[#99938C]">{field.help_text}</div> : null}
                        {fieldInput(field, responses[field.key], (value) => updateResponse(field.key, value))}
                      </label>
                    ))}</div> : protocol ? <div className="mt-3 rounded-xl bg-[#FBFAF8] p-4 text-[9px] text-[#817B73]">This protocol has no structured inspection or treatment fields.</div> : null}
                  </div>

                  {monitoringApplicable ? <div className="mt-6 border-t border-black/[0.06] pt-5">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div><div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">3 · Monitoring round</div><h3 className="mt-1 text-[15px] font-medium text-[#322E29]">Required monitoring coverage</h3></div>
                      <Link href={monitoringHref} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] font-medium text-[#665B4E]">Open round</Link>
                    </div>
                    {monitoring.loading ? <div className="mt-3 rounded-xl bg-[#FBFAF8] p-4 text-[9px] text-[#817B73]">Checking live monitoring coverage…</div> : monitoring.error ? <div className="mt-3 flex gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] p-4 text-[9px] leading-4 text-[#8B4937]"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{monitoring.error}</div> : monitoring.round ? <div className={`mt-3 rounded-xl border p-4 ${monitoring.round.completion_ready ? "border-[#748267]/18 bg-[#748267]/[0.04]" : "border-[#C08A4A]/22 bg-[#C08A4A]/[0.04]"}`}><div className="flex items-center justify-between gap-3"><div className="text-[10px] font-medium text-[#4A4540]">{monitoring.round.checked_required_points || 0}/{monitoring.round.required_points || 0} required points checked</div><span className={`text-[8px] font-medium ${monitoring.round.completion_ready ? "text-[#607057]" : "text-[#98513D]"}`}>{monitoring.round.completion_ready ? "Ready" : `${monitoring.round.pending_required_points || 0} pending`}</span></div>{monitoring.round.pending_codes?.length ? <div className="mt-2 text-[8px] leading-4 text-[#8D806F]">Still required: {monitoring.round.pending_codes.join(", ")}</div> : <div className="mt-2 text-[8px] leading-4 text-[#6F7968]">All due, overdue and never-checked points for this visit are covered.</div>}</div> : null}
                  </div> : null}

                  <div className="mt-6 border-t border-black/[0.06] pt-5">
                    <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">{monitoringApplicable ? "4" : "3"} · Prove</div>
                    <h3 className="mt-1 text-[15px] font-medium text-[#322E29]">Completion evidence</h3>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {[...evidence, ...externalFields.map((field) => field.label || field.key)].filter(Boolean).map((label) => <div key={label} className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-[#FBFAF8] px-3 py-3 text-[9px] text-[#625D56]"><FileCheck2 size={10} className="text-[#9A744B]" />{label}</div>)}
                      {!proofRequired ? <div className="flex items-center gap-2 rounded-xl border border-[#748267]/15 bg-[#748267]/[0.04] px-3 py-3 text-[9px] text-[#65705D]"><CheckCircle2 size={10} />No external proof required by this protocol.</div> : null}
                    </div>
                    {proofRequired ? <div className="mt-3 rounded-xl border border-[#C08A4A]/18 bg-[#C08A4A]/[0.04] p-3.5"><div className="text-[9px] font-medium text-[#76583A]">Linked Completion Evidence required</div><div className="mt-1 text-[8px] leading-3 text-[#8D806F]">Avantiqo will not fake photos, signatures or location evidence. Capture governed proof in Completion Evidence, then link its record ID here.</div><div className="mt-2.5 flex flex-col gap-2 sm:flex-row"><input value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)} placeholder="Completion Evidence record ID" className="min-w-0 flex-1 rounded-lg border border-black/[0.09] bg-white px-3 py-2 text-[10px] outline-none focus:border-[#D6A66A]/60" /><Link href={evidenceHref} className="inline-flex items-center justify-center rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] font-medium text-[#665B4E]">Open evidence</Link></div></div> : null}
                  </div>

                  <div className="mt-6 border-t border-black/[0.06] pt-5">
                    <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">{monitoringApplicable ? "5" : "4"} · Outcome</div>
                    <h3 className="mt-1 text-[15px] font-medium text-[#322E29]">Close the loop</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-3.5"><span className="text-[9px] font-medium text-[#4A4540]">Service outcome</span><select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="mt-2 w-full rounded-lg border border-black/[0.09] bg-white px-3 py-2.5 text-[11px]"><option value="completed">Completed</option><option value="follow_up">Follow-up required</option><option value="issue_found">Issue found</option></select></label>
                      <label className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-3.5"><span className="text-[9px] font-medium text-[#4A4540]">Follow-up / technician notes</span><textarea value={followUpNotes} onChange={(event) => setFollowUpNotes(event.target.value)} className="mt-2 min-h-20 w-full resize-y rounded-lg border border-black/[0.09] bg-white px-3 py-2 text-[11px]" placeholder="Only add information needed for the next decision." /></label>
                    </div>
                  </div>
                </div>

                <aside className="border-t border-black/[0.06] bg-[#FBFAF8] p-5 lg:border-l lg:border-t-0">
                  <div className="lg:sticky lg:top-5">
                    <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]"><ClipboardCheck size={10} /> Completion preflight</div>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between rounded-xl bg-white px-3 py-3 text-[9px]"><span className="text-[#6D675F]">Protocol attached</span><span className={protocol ? "text-[#607057]" : "text-[#98513D]"}>{protocol ? "Ready" : "Blocked"}</span></div>
                      <div className="flex items-center justify-between rounded-xl bg-white px-3 py-3 text-[9px]"><span className="text-[#6D675F]">Required fields</span><span className={protocolReady ? "text-[#607057]" : "text-[#98513D]"}>{completedRequired}/{requiredFields.length}</span></div>
                      {monitoringApplicable ? <div className="flex items-center justify-between rounded-xl bg-white px-3 py-3 text-[9px]"><span className="text-[#6D675F]">Monitoring round</span><span className={monitoringReady ? "text-[#607057]" : "text-[#98513D]"}>{monitoring.loading ? "Checking…" : monitoring.error ? "Unavailable" : monitoring.round?.completion_ready ? `${monitoring.round.checked_required_points}/${monitoring.round.required_points} ready` : `${monitoring.round?.pending_required_points || 0} pending`}</span></div> : null}
                      <div className="flex items-center justify-between rounded-xl bg-white px-3 py-3 text-[9px]"><span className="text-[#6D675F]">Required proof</span><span className={proofReady ? "text-[#607057]" : "text-[#98513D]"}>{proofReady ? "Ready" : "Missing"}</span></div>
                      <div className="flex items-center justify-between rounded-xl bg-white px-3 py-3 text-[9px]"><span className="text-[#6D675F]">Outcome</span><span className="text-[#607057]">{outcome === "completed" ? "Complete" : outcome === "follow_up" ? "Follow-up" : "Issue"}</span></div>
                    </div>

                    <div className="mt-4 rounded-xl border border-black/[0.06] bg-white p-3.5 text-[8px] leading-4 text-[#837C73]">Completion validates the live protocol, monitoring coverage and required proof before the canonical work-order mutation. It then reconciles the exact service occurrence, consumes recorded service materials, and creates follow-up work automatically when the outcome requires it.</div>

                    {notice ? <div className={`mt-3 rounded-xl border px-3.5 py-3 text-[9px] leading-4 ${notice.toLowerCase().includes("could") || notice.toLowerCase().includes("required") || notice.toLowerCase().includes("cannot") || notice.toLowerCase().includes("incomplete") ? "border-[#B36B52]/20 bg-[#B36B52]/[0.05] text-[#8B4937]" : "border-[#748267]/18 bg-[#748267]/[0.05] text-[#607057]"}`}>{notice}</div> : null}

                    <button type="button" disabled={!completionReady || busy === "complete"} onClick={() => execute("complete")} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2C2925] px-4 py-3.5 text-[10px] font-medium text-white transition hover:bg-[#3B3630] disabled:cursor-not-allowed disabled:opacity-35"><CheckCircle2 size={12} />{busy === "complete" ? "Completing…" : isTerminal(selected) ? "Service completed" : "Complete & reconcile"}</button>
                    {!completionReady && !isTerminal(selected) ? <div className="mt-2 text-center text-[8px] leading-3 text-[#9C958D]">Completion stays locked until the live protocol, monitoring and proof preflight is satisfied.</div> : null}
                  </div>
                </aside>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}