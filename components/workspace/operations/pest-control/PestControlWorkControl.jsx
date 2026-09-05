"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
  Wrench,
  X,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import {
  buildOperationsCommandPayload,
  getOperationsCommandInitialValues,
  getOperationsCommandSchema,
  validateOperationsCommand,
} from "@/lib/operations/forms/OperationsCommandSchemaRegistry";

const TERMINAL_STATUSES = new Set(["complete", "completed", "cancelled", "canceled"]);
const ACTIVE_STATUSES = new Set(["assigned", "released", "in_progress", "paused"]);
const STATUS_ORDER = Object.freeze({
  draft: 0,
  assigned: 1,
  released: 2,
  in_progress: 3,
  paused: 3,
  completed: 4,
  complete: 4,
});

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function dateValue(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function sameDay(a, b = new Date()) {
  const left = dateValue(a);
  if (!left) return false;
  return left.getFullYear() === b.getFullYear()
    && left.getMonth() === b.getMonth()
    && left.getDate() === b.getDate();
}

function formatDateTime(value) {
  const date = dateValue(value);
  if (!date) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(value) {
  const date = dateValue(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isOverdue(row) {
  const due = dateValue(row?.due_at);
  return Boolean(due && due.getTime() < Date.now() && !TERMINAL_STATUSES.has(normalized(row?.status)));
}

function priorityRank(value) {
  return ({ critical: 4, high: 3, normal: 2, medium: 2, low: 1 }[normalized(value)] || 0);
}

function statusTone(status) {
  const value = normalized(status);
  if (["completed", "complete"].includes(value)) return "border-[#71826A]/20 bg-[#71826A]/[0.06] text-[#5F7357]";
  if (value === "in_progress") return "border-[#8A765D]/20 bg-[#8A765D]/[0.07] text-[#725F47]";
  if (value === "paused") return "border-[#B08B56]/25 bg-[#B08B56]/[0.08] text-[#8A683B]";
  if (value === "released") return "border-[#7D8890]/20 bg-[#7D8890]/[0.06] text-[#637079]";
  if (value === "assigned") return "border-[#857C70]/20 bg-[#857C70]/[0.06] text-[#6F675E]";
  return "border-black/[0.08] bg-black/[0.025] text-[#776F66]";
}

function priorityTone(priority) {
  const value = normalized(priority);
  if (value === "critical") return "border-[#B7654C]/25 bg-[#B7654C]/[0.07] text-[#914B38]";
  if (value === "high") return "border-[#D6A66A]/35 bg-[#D6A66A]/[0.09] text-[#7B5A34]";
  return "border-black/[0.07] bg-black/[0.02] text-[#81786F]";
}

function sourceLabel(row) {
  const source = normalized(row?.source_type);
  if (source === "monitoring_corrective_action") return "Monitoring follow-up";
  if (source === "service_occurrence") return "Scheduled service";
  if (source === "service_follow_up") return "Service follow-up";
  if (source === "service_plan") return "Planned service";
  return text(row?.source_type).replaceAll("-", " ") || "Operational work";
}

function workContext(row = {}) {
  const attributes = row.attributes || {};
  const monitoring = attributes.monitoring_follow_up || null;
  const service = attributes.service_delivery || attributes.service_follow_up || {};
  const staff = attributes.staff_execution || {};
  const customerName = monitoring?.customer_name || service.customer_name || attributes.customer_name || "Customer not linked";
  const siteName = monitoring?.customer_location_name || service.customer_location_name || attributes.customer_location_name || "Site not linked";
  const serviceName = service.service_name
    || monitoring?.service_name
    || (monitoring ? "Monitoring corrective follow-up" : null)
    || row.name
    || "Work order";
  const assigneeName = attributes.assignee_name
    || attributes.assignment?.assignee_name
    || staff.technician_name
    || null;
  const scheduledAt = row.scheduled_at
    || attributes.scheduled_at
    || service.scheduled_at
    || service.service_date
    || null;
  const arrivalStart = row.window_start
    || attributes.window_start
    || service.window_start
    || service.arrival_window_start
    || null;
  const arrivalEnd = row.window_end
    || attributes.window_end
    || service.window_end
    || service.arrival_window_end
    || null;

  return {
    monitoring,
    service,
    staff,
    customerName,
    siteName,
    serviceName,
    assigneeName,
    scheduledAt,
    arrivalStart,
    arrivalEnd,
    area: monitoring?.area || service.area || null,
    placement: monitoring?.placement || null,
    pointCode: monitoring?.point_code || null,
    triggerCheckId: monitoring?.trigger_check_id || null,
    signals: Array.isArray(monitoring?.signals) ? monitoring.signals : [],
    recommendation: monitoring?.recommendation || row.description || null,
    followUp: Boolean(monitoring),
  };
}

function needsAttention(row) {
  const status = normalized(row?.status);
  return !TERMINAL_STATUSES.has(status) && (
    priorityRank(row?.priority) >= 3
    || isOverdue(row)
    || !row?.assigned_to
    || status === "draft"
    || status === "paused"
  );
}

function lifecycleIndex(status) {
  return STATUS_ORDER[normalized(status)] ?? 0;
}

function humanStatus(status) {
  return normalized(status).replaceAll("_", " ") || "draft";
}

function Field({ field, value, onChange, lookupOptions = [] }) {
  const common = {
    value: value ?? "",
    onChange: (event) => onChange(field.name, event.target.value),
    className: "mt-2 w-full rounded-xl border border-black/[0.09] bg-white px-3.5 py-3 text-[11px] text-[#2B2926] outline-none transition focus:border-[#D6A66A]/70",
    required: Boolean(field.required),
  };

  return (
    <label className="block">
      <span className="text-[8px] uppercase tracking-[0.12em] text-[#8F877E]">
        {field.label}{field.required ? " *" : ""}
      </span>
      {field.type === "textarea" ? (
        <textarea {...common} placeholder={field.placeholder} className={`${common.className} min-h-24 resize-y`} />
      ) : field.type === "select" ? (
        <select {...common}>
          {(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : field.type === "lookup" ? (
        <select {...common}>
          <option value="">Select {field.label.toLowerCase()}</option>
          {lookupOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <input {...common} type={field.type || "text"} step={field.step} placeholder={field.placeholder} />
      )}
    </label>
  );
}

export default function PestControlWorkControl({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState("attention");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [commandModal, setCommandModal] = useState(null);
  const [commandValues, setCommandValues] = useState({});
  const [assignees, setAssignees] = useState([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);

  const contextPayload = useMemo(() => ({
    organization_id: organizationId,
    organizationId,
    entity_id: entityId || null,
    entityId: entityId || null,
    period_id: periodId || null,
    periodId: periodId || null,
  }), [organizationId, entityId, periodId]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ organization_id: organizationId });
      if (entityId) params.set("entity_id", entityId);
      if (periodId) params.set("period_id", periodId);
      const response = await fetch(`/api/operations/work-orders?${params.toString()}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "Work orders could not be loaded.");
      const next = Array.isArray(json.rows) ? json.rows : [];
      setRows(next);
      setSelectedId((current) => current && next.some((row) => row.id === current) ? current : next[0]?.id || "");
    } catch (loadError) {
      setRows([]);
      setError(loadError.message || "Work orders could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, entityId, periodId]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    attention: rows.filter(needsAttention).length,
    unassigned: rows.filter((row) => !row.assigned_to && !TERMINAL_STATUSES.has(normalized(row.status))).length,
    today: rows.filter((row) => sameDay(row.due_at || workContext(row).scheduledAt)).length,
    overdue: rows.filter(isOverdue).length,
    working: rows.filter((row) => ACTIVE_STATUSES.has(normalized(row.status))).length,
    done: rows.filter((row) => TERMINAL_STATUSES.has(normalized(row.status)) && sameDay(row.completed_at || row.updated_at)).length,
    all: rows.length,
  }), [rows]);

  const filteredRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        const status = normalized(row.status);
        if (tab === "attention" && !needsAttention(row)) return false;
        if (tab === "unassigned" && (row.assigned_to || TERMINAL_STATUSES.has(status))) return false;
        if (tab === "today" && !sameDay(row.due_at || workContext(row).scheduledAt)) return false;
        if (tab === "working" && !ACTIVE_STATUSES.has(status)) return false;
        if (tab === "done" && !TERMINAL_STATUSES.has(status)) return false;
        if (!search) return true;
        const context = workContext(row);
        return [
          row.name,
          row.description,
          row.status,
          row.priority,
          row.assigned_to,
          sourceLabel(row),
          context.customerName,
          context.siteName,
          context.serviceName,
          context.pointCode,
          context.area,
          ...(context.signals || []),
        ].filter(Boolean).join(" ").toLowerCase().includes(search);
      })
      .sort((a, b) => {
        const attentionDifference = Number(needsAttention(b)) - Number(needsAttention(a));
        if (attentionDifference) return attentionDifference;
        const priorityDifference = priorityRank(b.priority) - priorityRank(a.priority);
        if (priorityDifference) return priorityDifference;
        const aDue = dateValue(a.due_at)?.getTime() || Number.MAX_SAFE_INTEGER;
        const bDue = dateValue(b.due_at)?.getTime() || Number.MAX_SAFE_INTEGER;
        if (aDue !== bDue) return aDue - bDue;
        return (dateValue(b.created_at)?.getTime() || 0) - (dateValue(a.created_at)?.getTime() || 0);
      });
  }, [rows, tab, query]);

  const selected = filteredRows.find((row) => row.id === selectedId) || filteredRows[0] || null;
  const selectedContext = selected ? workContext(selected) : null;
  const allowedCommands = Array.isArray(selected?.allowed_commands) ? selected.allowed_commands : [];

  useEffect(() => {
    if (!selected && filteredRows.length) setSelectedId(filteredRows[0].id);
  }, [filteredRows, selected]);

  async function loadAssignees() {
    if (assignees.length || assigneesLoading) return;
    setAssigneesLoading(true);
    try {
      const response = await fetch(`/api/platform/users/assignable?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Assignable people could not be loaded.");
      setAssignees((json.users || []).map((user) => ({
        value: user.party_id || user.staff_id,
        label: [user.name, user.position || user.role, user.department].filter(Boolean).join(" · "),
        party_id: user.party_id || null,
        staff_id: user.staff_id || null,
      })).filter((option) => option.value));
    } catch (lookupError) {
      setError(lookupError.message || "Assignable people could not be loaded.");
    } finally {
      setAssigneesLoading(false);
    }
  }

  async function openCommand(command) {
    if (!selected || !allowedCommands.includes(command)) return;
    const schema = getOperationsCommandSchema(command);
    setCommandModal(schema);
    setCommandValues(getOperationsCommandInitialValues(command, selected));
    setError("");
    if (schema.fields.some((field) => field.optionsSource === "assignable-users")) await loadAssignees();
  }

  async function submitCommand() {
    if (!selected || !commandModal) return;
    const missing = validateOperationsCommand(commandModal, commandValues);
    if (missing.length) {
      setError(`Complete required fields: ${missing.join(", ")}`);
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const idempotencyKey = createIdempotencyKey();
      const response = await fetch(`/api/operations/work-orders/commands/${commandModal.command}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          ...contextPayload,
          id: selected.id,
          record_id: selected.id,
          ...buildOperationsCommandPayload(commandModal, commandValues, { assignees }),
          idempotency_key: idempotencyKey,
          idempotencyKey,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "Work command failed.");
      setNotice(`${commandModal.title} completed.`);
      setCommandModal(null);
      setCommandValues({});
      await load();
    } catch (commandError) {
      setError(commandError.message || "Work command failed.");
    } finally {
      setSaving(false);
    }
  }

  const base = `/workspace/${encodeURIComponent(organizationId)}/operations`;
  const lifecycle = ["draft", "assigned", "released", "in_progress", "completed"];
  const currentIndex = selected ? lifecycleIndex(selected.status) : 0;
  const primaryCommand = allowedCommands.find((command) => ["assign", "release", "start", "complete"].includes(command)) || allowedCommands[0] || null;

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#201E1B] md:px-7 lg:px-8">
      <div className="mx-auto max-w-[1540px]">
        <header className="border-b border-black/[0.07] pb-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[9px] uppercase tracking-[0.17em] text-[#9A744B]">Pest Control · Operations</div>
              <h1 className="mt-1 text-[29px] font-medium tracking-[-0.045em]">Work control</h1>
              <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#756F68]">One operating surface for service work, corrective follow-up, ownership, timing, field execution and evidence-backed completion.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`${base}/dispatch`} className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[9px] font-medium text-[#5F5952]">Today’s dispatch</Link>
              <Link href={`${base}/field-service/monitoring-exceptions`} className="rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] px-3.5 py-2.5 text-[9px] font-medium text-[#725434]">Monitoring exceptions</Link>
              <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[9px] font-medium text-[#5F5952]" aria-label="Refresh work"><RefreshCw size={12} className={loading ? "animate-spin" : ""} />Refresh</button>
            </div>
          </div>
        </header>

        {error ? <div className="mt-4 rounded-xl border border-[#B7654C]/20 bg-[#B7654C]/[0.05] px-4 py-3 text-[10px] text-[#914B38]">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-xl border border-[#71826A]/20 bg-[#71826A]/[0.05] px-4 py-3 text-[10px] text-[#5F7357]">{notice}</div> : null}

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["Needs attention", counts.attention, "Human decision or intervention"],
            ["Unassigned", counts.unassigned, "No accountable owner"],
            ["Due today", counts.today, "Committed today"],
            ["Overdue", counts.overdue, "Past due now"],
            ["Working", counts.working, "Assigned / active"],
            ["Done today", counts.done, "Completed today"],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-2xl border border-black/[0.07] bg-white p-4">
              <div className="text-[8px] uppercase tracking-[0.1em] text-[#948D84]">{label}</div>
              <div className="mt-2 text-[24px] font-medium tracking-[-0.04em]">{value || 0}</div>
              <div className="mt-1 text-[8px] text-[#9B948C]">{detail}</div>
            </div>
          ))}
        </section>

        <section className="mt-5 rounded-2xl border border-black/[0.07] bg-white p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {[
              ["attention", "Attention", counts.attention],
              ["unassigned", "Unassigned", counts.unassigned],
              ["today", "Today", counts.today],
              ["working", "Working", counts.working],
              ["done", "Done", rows.filter((row) => TERMINAL_STATUSES.has(normalized(row.status))).length],
              ["all", "All", counts.all],
            ].map(([id, label, value]) => (
              <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-3.5 py-2 text-[9px] transition ${tab === id ? "bg-[#2E2A25] text-white" : "text-[#746D65] hover:bg-black/[0.03]"}`}>{label}<span className="ml-1.5 text-[8px] opacity-60">{value}</span></button>
            ))}
            <div className="ml-auto flex min-w-[240px] flex-1 items-center rounded-xl border border-black/[0.08] bg-[#FBFAF8] px-3 lg:max-w-[360px]">
              <Search size={12} className="text-[#9B9389]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer, site, work, point…" className="w-full bg-transparent px-2.5 py-2.5 text-[10px] outline-none placeholder:text-[#A9A198]" />
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(420px,0.88fr)_minmax(0,1.45fr)]">
          <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
              <div><div className="text-[10px] font-medium">Work queue</div><div className="text-[8px] text-[#9A938A]">{filteredRows.length} visible · priority sorted</div></div>
              <div className="text-[8px] uppercase tracking-[0.1em] text-[#9B744A]">{tab}</div>
            </div>
            <div className="max-h-[calc(100vh-310px)] min-h-[520px] overflow-y-auto">
              {filteredRows.map((row) => {
                const context = workContext(row);
                const active = selected?.id === row.id;
                const overdue = isOverdue(row);
                return (
                  <button key={row.id} onClick={() => setSelectedId(row.id)} className={`block w-full border-b border-black/[0.05] px-4 py-4 text-left transition last:border-b-0 ${active ? "bg-[#D6A66A]/[0.08] shadow-[inset_3px_0_0_#D6A66A]" : "hover:bg-black/[0.018]"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full border px-2 py-1 text-[7px] uppercase tracking-[0.08em] ${statusTone(row.status)}`}>{humanStatus(row.status)}</span>
                          {priorityRank(row.priority) >= 3 ? <span className={`rounded-full border px-2 py-1 text-[7px] uppercase tracking-[0.08em] ${priorityTone(row.priority)}`}>{row.priority}</span> : null}
                          {overdue ? <span className="rounded-full border border-[#B7654C]/20 bg-[#B7654C]/[0.05] px-2 py-1 text-[7px] uppercase tracking-[0.08em] text-[#914B38]">overdue</span> : null}
                        </div>
                        <div className="mt-2 truncate text-[12px] font-medium tracking-[-0.01em]">{context.serviceName}</div>
                        <div className="mt-1 truncate text-[9px] text-[#756F68]">{context.customerName} · {context.siteName}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-[9px] font-medium ${overdue ? "text-[#914B38]" : "text-[#6E675F]"}`}>{row.due_at ? formatDateTime(row.due_at) : context.scheduledAt ? formatDateTime(context.scheduledAt) : "No due time"}</div>
                        <div className="mt-1 text-[8px] text-[#A09990]">{sourceLabel(row)}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[8px] text-[#8A837A]">
                      <span className="inline-flex items-center gap-1"><UserRound size={9} />{context.assigneeName || (row.assigned_to ? "Assigned" : "Unassigned")}</span>
                      {context.area ? <span className="inline-flex items-center gap-1"><MapPin size={9} />{context.area}</span> : null}
                      {context.pointCode ? <span className="inline-flex items-center gap-1"><ShieldAlert size={9} />{context.pointCode}</span> : null}
                    </div>
                  </button>
                );
              })}
              {!loading && !filteredRows.length ? <div className="p-10 text-center text-[10px] text-[#8C857D]"><CheckCircle2 className="mx-auto mb-2" size={18} />No work in this view.</div> : null}
              {loading && !rows.length ? <div className="p-10 text-center text-[10px] text-[#8C857D]">Loading operational work…</div> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-black/[0.07] bg-white">
            {selected && selectedContext ? (
              <>
                <div className="border-b border-black/[0.06] p-5 lg:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[7px] uppercase tracking-[0.09em] ${statusTone(selected.status)}`}>{humanStatus(selected.status)}</span>
                        <span className={`rounded-full border px-2.5 py-1 text-[7px] uppercase tracking-[0.09em] ${priorityTone(selected.priority)}`}>{selected.priority || "normal"}</span>
                        <span className="text-[8px] text-[#9C958C]">{sourceLabel(selected)}</span>
                      </div>
                      <h2 className="mt-3 text-[22px] font-medium tracking-[-0.035em]">{selectedContext.serviceName}</h2>
                      <div className="mt-1 text-[10px] text-[#777069]">{selectedContext.customerName} · {selectedContext.siteName}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedContext.followUp ? <Link href={`${base}/field-service/monitoring-points/scan`} className="rounded-xl border border-black/[0.08] bg-[#FBFAF8] px-3 py-2 text-[8px] font-medium text-[#6B645C]">Recheck point</Link> : null}
                      <Link href={`${base}/field-service/technician`} className="inline-flex items-center gap-1.5 rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] px-3 py-2 text-[8px] font-medium text-[#725434]">Technician workspace <ArrowRight size={9} /></Link>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-5 gap-1.5">
                    {lifecycle.map((step, index) => {
                      const reached = index <= currentIndex;
                      const active = index === currentIndex;
                      return <div key={step}><div className={`h-1 rounded-full ${reached ? "bg-[#D6A66A]" : "bg-black/[0.06]"}`} /><div className={`mt-1.5 text-[7px] uppercase tracking-[0.07em] ${active ? "font-medium text-[#725434]" : "text-[#A29A90]"}`}>{step.replace("in_progress", "working")}</div></div>;
                    })}
                  </div>
                </div>

                <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.8fr)] lg:p-6">
                  <div className="space-y-4">
                    <div className={`rounded-2xl border p-4 ${needsAttention(selected) ? "border-[#D6A66A]/25 bg-[#D6A66A]/[0.055]" : "border-black/[0.07] bg-[#FBFAF8]"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[8px] uppercase tracking-[0.12em] text-[#9A744B]">Next operational action</div>
                          <div className="mt-1 text-[13px] font-medium">{primaryCommand ? getOperationsCommandSchema(primaryCommand).title : TERMINAL_STATUSES.has(normalized(selected.status)) ? "Work complete" : "No action available"}</div>
                          <div className="mt-1 max-w-xl text-[9px] leading-4 text-[#7D766D]">{primaryCommand ? getOperationsCommandSchema(primaryCommand).description : "This work is currently read-only for your permissions or lifecycle state."}</div>
                        </div>
                        {primaryCommand ? <button disabled={saving} onClick={() => openCommand(primaryCommand)} className="shrink-0 rounded-xl bg-[#2E2A25] px-4 py-2.5 text-[9px] font-medium text-white disabled:opacity-40">{getOperationsCommandSchema(primaryCommand).confirmLabel}</button> : <CheckCircle2 size={16} className="text-[#71826A]" />}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-black/[0.07] p-4">
                      <div className="text-[8px] uppercase tracking-[0.11em] text-[#958D84]">Work brief</div>
                      <div className="mt-3 text-[10px] leading-5 text-[#5F5952]">{selected.description || selectedContext.recommendation || "No additional work instructions recorded."}</div>
                    </div>

                    {selectedContext.followUp ? (
                      <div className="rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.035] p-4">
                        <div className="flex items-center gap-2 text-[9px] font-medium text-[#6E5538]"><ShieldAlert size={12} />Why this follow-up exists</div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div><div className="text-[7px] uppercase tracking-[0.1em] text-[#A18463]">Monitoring point</div><div className="mt-1 text-[10px]">{selectedContext.pointCode || "Not recorded"}</div></div>
                          <div><div className="text-[7px] uppercase tracking-[0.1em] text-[#A18463]">Area / placement</div><div className="mt-1 text-[10px]">{[selectedContext.area, selectedContext.placement].filter(Boolean).join(" · ") || "Not recorded"}</div></div>
                          <div className="sm:col-span-2"><div className="text-[7px] uppercase tracking-[0.1em] text-[#A18463]">Trigger evidence</div><div className="mt-1 text-[9px] text-[#6F655B]">Check {selectedContext.triggerCheckId || "not recorded"}{selectedContext.signals.length ? ` · ${selectedContext.signals.join(", ")}` : ""}</div></div>
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-black/[0.07] p-4">
                        <div className="flex items-center gap-2 text-[8px] uppercase tracking-[0.1em] text-[#958D84]"><MapPin size={10} />Customer & site</div>
                        <div className="mt-2 text-[11px] font-medium">{selectedContext.customerName}</div>
                        <div className="mt-1 text-[9px] text-[#777069]">{selectedContext.siteName}{selectedContext.area ? ` · ${selectedContext.area}` : ""}</div>
                      </div>
                      <div className="rounded-2xl border border-black/[0.07] p-4">
                        <div className="flex items-center gap-2 text-[8px] uppercase tracking-[0.1em] text-[#958D84]"><UserRound size={10} />Responsibility</div>
                        <div className="mt-2 text-[11px] font-medium">{selectedContext.assigneeName || (selected.assigned_to ? "Assigned technician" : "Unassigned")}</div>
                        <div className="mt-1 text-[9px] text-[#777069]">{selected.assigned_to || "Assign an accountable owner before release."}</div>
                      </div>
                    </div>
                  </div>

                  <aside className="space-y-3">
                    <div className="rounded-2xl border border-black/[0.07] bg-[#FBFAF8] p-4">
                      <div className="text-[8px] uppercase tracking-[0.11em] text-[#958D84]">Timing</div>
                      <div className="mt-3 space-y-3">
                        <div className="flex items-start gap-2"><CalendarClock size={12} className="mt-0.5 text-[#8D7A64]" /><div><div className="text-[8px] text-[#9A938A]">Due</div><div className={`text-[10px] font-medium ${isOverdue(selected) ? "text-[#914B38]" : "text-[#56504A]"}`}>{formatDateTime(selected.due_at)}</div></div></div>
                        <div className="flex items-start gap-2"><Clock3 size={12} className="mt-0.5 text-[#8D7A64]" /><div><div className="text-[8px] text-[#9A938A]">Scheduled / arrival</div><div className="text-[10px] font-medium text-[#56504A]">{selectedContext.arrivalStart ? `${formatTime(selectedContext.arrivalStart)}${selectedContext.arrivalEnd ? `–${formatTime(selectedContext.arrivalEnd)}` : ""}` : formatDateTime(selectedContext.scheduledAt)}</div></div></div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-black/[0.07] p-4">
                      <div className="text-[8px] uppercase tracking-[0.11em] text-[#958D84]">Available controls</div>
                      <div className="mt-3 grid gap-2">
                        {allowedCommands.map((command) => (
                          <button key={command} disabled={saving} onClick={() => openCommand(command)} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[9px] disabled:opacity-40 ${command === primaryCommand ? "border-[#D6A66A]/30 bg-[#D6A66A]/[0.06] text-[#725434]" : "border-black/[0.07] bg-white text-[#625C55]"}`}><span>{getOperationsCommandSchema(command).title}</span><ArrowRight size={9} /></button>
                        ))}
                        {!allowedCommands.length ? <div className="rounded-xl bg-[#FBFAF8] px-3 py-3 text-[9px] text-[#8F877F]">No lifecycle actions available.</div> : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-black/[0.07] p-4">
                      <div className="text-[8px] uppercase tracking-[0.11em] text-[#958D84]">Governance</div>
                      <div className="mt-2 text-[9px] leading-4 text-[#777069]">Work remains in the canonical Operations lifecycle. Assignment comes from People authority; products and stock remain Supply Chain authority; customer/site identity remains Commercial authority.</div>
                    </div>
                  </aside>
                </div>
              </>
            ) : (
              <div className="flex min-h-[620px] items-center justify-center p-8 text-center text-[10px] text-[#8C857D]"><div><Wrench className="mx-auto mb-2" size={18} />Select work from the queue to inspect context and act.</div></div>
            )}
          </div>
        </section>
      </div>

      {commandModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-2xl border border-black/[0.08] bg-[#F9F8F5] shadow-2xl">
            <div className="flex items-start justify-between border-b border-black/[0.07] p-5">
              <div><div className="text-[8px] uppercase tracking-[0.12em] text-[#9A744B]">Governed work action</div><div className="mt-1 text-[17px] font-medium tracking-[-0.02em]">{commandModal.title}</div><div className="mt-1 text-[9px] leading-4 text-[#7D766E]">{commandModal.description}</div></div>
              <button onClick={() => setCommandModal(null)} className="rounded-lg border border-black/[0.07] bg-white p-2" aria-label="Close"><X size={12} /></button>
            </div>
            <div className="space-y-4 p-5">
              {commandModal.fields.map((field) => <Field key={field.name} field={field} value={commandValues[field.name]} onChange={(name, value) => setCommandValues((current) => ({ ...current, [name]: value }))} lookupOptions={field.optionsSource === "assignable-users" ? assignees : []} />)}
              {commandModal.fields.some((field) => field.optionsSource === "assignable-users") && assigneesLoading ? <div className="text-[8px] text-[#948D84]">Loading assignable people…</div> : null}
              {error ? <div className="rounded-xl border border-[#B7654C]/20 bg-[#B7654C]/[0.05] p-3 text-[9px] text-[#914B38]"><AlertTriangle size={11} className="mr-1 inline" />{error}</div> : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-black/[0.07] p-4">
              <button onClick={() => setCommandModal(null)} className="rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-[9px] text-[#6E675F]">Cancel</button>
              <button disabled={saving} onClick={submitCommand} className="rounded-xl bg-[#2E2A25] px-4 py-2.5 text-[9px] font-medium text-white disabled:opacity-40">{saving ? "Working…" : commandModal.confirmLabel}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
