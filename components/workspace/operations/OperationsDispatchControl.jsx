"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
  Route,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const RELATED_FEEDS = Object.freeze([
  ["dispatch", "Dispatch"],
  ["work-orders", "Work orders"],
  ["appointment-windows", "Appointment windows"],
  ["assignments", "Assignments"],
  ["schedule-conflicts", "Schedule conflicts"],
  ["routing", "Routing"],
]);

const TERMINAL = new Set(["complete", "completed", "closed", "cancelled", "canceled", "resolved", "released", "archived", "done"]);
const HIGH = new Set(["critical", "urgent", "highest", "high", "p1", "p2"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function titleCase(value) {
  return text(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function isTerminal(row) {
  return TERMINAL.has(normalized(row?.status));
}

function isHigh(row) {
  return HIGH.has(normalized(row?.priority));
}

function dateKey(value, timeZone) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function formatTime(value, timeZone) {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return date.toLocaleTimeString([], {
    timeZone: timeZone || undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDue(value, timeZone) {
  if (!value) return "No deadline";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No deadline";
  return date.toLocaleString([], {
    timeZone: timeZone || undefined,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function rowIdentity(row) {
  return text(row?.source_id || row?.work_order_id || row?.record_id || row?.id);
}

function decisionFor(row, conflictIds, now, todayKey) {
  const id = rowIdentity(row);
  const due = row?.due_at ? new Date(row.due_at) : null;
  const overdue = due && !Number.isNaN(due.getTime()) && due < now && !isTerminal(row);
  const dueToday = dateKey(row?.due_at, row?.time_zone) === todayKey;
  const scheduledToday = dateKey(row?.scheduled_start, row?.time_zone) === todayKey;

  if (conflictIds.has(id)) {
    return { rank: 1200, state: "Conflict", title: "Resolve schedule conflict", detail: "A live conflict signal exists. Resolve the constraint before dispatch changes are accepted." };
  }
  if (overdue) {
    return { rank: 1000, state: "Overdue", title: "Recover commitment", detail: "This work is past its committed time. Protect the customer promise before healthy work is reshuffled." };
  }
  if (!text(row?.assigned_to)) {
    return { rank: 800, state: "Unassigned", title: "Assign accountable technician", detail: "Ownership is missing. Assign an eligible person before the work enters execution." };
  }
  if (isHigh(row)) {
    return { rank: 650, state: "Priority", title: "Protect priority work", detail: "Confirm timing and constraints before lower-priority work consumes capacity." };
  }
  if (dueToday || scheduledToday) {
    return { rank: 400, state: "Today", title: "Confirm dispatch readiness", detail: "This work is committed today. Confirm ownership, timing and known constraints." };
  }
  return null;
}

function stateTone(value) {
  const state = normalized(value);
  if (state === "conflict" || state === "overdue") return "border-[#B36B52]/20 bg-[#B36B52]/[0.07] text-[#98513D]";
  if (state === "priority") return "border-[#C08A4A]/20 bg-[#C08A4A]/[0.08] text-[#8B6236]";
  if (state === "unassigned") return "border-[#A37849]/18 bg-[#A37849]/[0.06] text-[#76583A]";
  return "border-black/[0.07] bg-[#F7F6F3] text-[#77736C]";
}

function Metric({ label, value, detail, attention = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">{label}</div>
      <div className={`mt-2.5 text-[24px] font-medium tracking-[-0.035em] ${attention && Number(value) > 0 ? "text-[#98513D]" : "text-[#1A1917]"}`}>{value}</div>
      <div className="mt-1 text-[10px] leading-4 text-[#9A968E]">{detail}</div>
    </div>
  );
}

export default function OperationsDispatchControl({ capability }) {
  const businessContext = useBusinessContext() || {};
  const organizationId = text(businessContext.organization_id || businessContext.organization?.id);
  const entityId = text(businessContext.entity_id || businessContext.entity?.id);
  const periodId = text(businessContext.period_id || businessContext.period?.id);
  const organizationName = businessContext.organization?.name || "Organization";
  const entityName = businessContext.entity?.display_name || businessContext.entity?.legal_name || businessContext.entity?.name || "All entities";
  const periodName = businessContext.period?.name || businessContext.period?.period_name || businessContext.period?.label || "Current period";
  const timeZone = text(businessContext.timezone || businessContext.organization?.timezone) || undefined;

  const [state, setState] = useState({ loading: true, error: "", feeds: {}, feedState: {}, assignees: [] });

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (!silent) setState((current) => ({ ...current, loading: true, error: "" }));

    const params = new URLSearchParams({ organization_id: organizationId });
    if (entityId) params.set("entity_id", entityId);
    if (periodId) params.set("period_id", periodId);

    try {
      const feedResults = await Promise.all(RELATED_FEEDS.map(async ([id]) => {
        try {
          const response = await fetch(`/api/operations/${id}?${params.toString()}`, { cache: "no-store", credentials: "include" });
          const json = await response.json().catch(() => ({}));
          return [id, response.ok && json.ok ? (Array.isArray(json.rows) ? json.rows : []) : [], response.ok && json.ok];
        } catch {
          return [id, [], false];
        }
      }));

      let assignees = [];
      try {
        const response = await fetch(`/api/platform/users/assignable?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store", credentials: "include" });
        const json = await response.json().catch(() => ({}));
        if (response.ok && json.success) assignees = Array.isArray(json.users) ? json.users : [];
      } catch {
        assignees = [];
      }

      const feeds = Object.fromEntries(feedResults.map(([id, rows]) => [id, rows]));
      const feedState = Object.fromEntries(feedResults.map(([id, , available]) => [id, available]));
      setState({ loading: false, error: "", feeds, feedState, assignees });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Dispatch state could not be loaded." }));
    }
  }, [entityId, organizationId, periodId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onFocus = () => load({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const dispatchRows = state.feeds.dispatch || [];
  const workOrders = state.feeds["work-orders"] || [];
  const appointments = state.feeds["appointment-windows"] || [];
  const conflicts = state.feeds["schedule-conflicts"] || [];
  const assignments = state.feeds.assignments || [];
  const routing = state.feeds.routing || [];

  const now = useMemo(() => new Date(), [state.feeds]);
  const todayKey = dateKey(now, timeZone);

  const conflictIds = useMemo(() => new Set(conflicts.flatMap((row) => [rowIdentity(row), text(row?.source_id), text(row?.attributes?.work_id), text(row?.attributes?.work_order_id)]).filter(Boolean)), [conflicts]);

  const candidateRows = useMemo(() => {
    const seen = new Set();
    return [...dispatchRows, ...workOrders, ...appointments].filter((row) => {
      if (isTerminal(row)) return false;
      const id = rowIdentity(row);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [appointments, dispatchRows, workOrders]);

  const decisions = useMemo(() => candidateRows
    .map((row) => ({ row, decision: decisionFor({ ...row, time_zone: timeZone }, conflictIds, now, todayKey) }))
    .filter((item) => item.decision)
    .sort((a, b) => b.decision.rank - a.decision.rank || new Date(a.row.due_at || a.row.scheduled_start || 8640000000000000) - new Date(b.row.due_at || b.row.scheduled_start || 8640000000000000)), [candidateRows, conflictIds, now, timeZone, todayKey]);

  const todayRows = useMemo(() => candidateRows
    .filter((row) => dateKey(row.scheduled_start || row.due_at, timeZone) === todayKey)
    .sort((a, b) => new Date(a.scheduled_start || a.due_at || 0) - new Date(b.scheduled_start || b.due_at || 0)), [candidateRows, timeZone, todayKey]);

  const completedToday = useMemo(() => [...dispatchRows, ...workOrders].filter((row) => dateKey(row.completed_at, timeZone) === todayKey).length, [dispatchRows, workOrders, timeZone, todayKey]);
  const overdue = decisions.filter((item) => item.decision.state === "Overdue").length;
  const unassigned = decisions.filter((item) => item.decision.state === "Unassigned").length;
  const priority = decisions.filter((item) => item.decision.state === "Priority").length;

  const assigneeNames = useMemo(() => new Map(state.assignees.flatMap((user) => {
    const label = user.name || user.display_name || user.email || "Team member";
    return [[text(user.party_id), label], [text(user.staff_id), label], [text(user.id), label]].filter(([id]) => id);
  })), [state.assignees]);

  const resourceRows = useMemo(() => {
    const counts = new Map();
    candidateRows.forEach((row) => {
      const id = text(row.assigned_to);
      if (!id) return;
      const current = counts.get(id) || { id, scheduled: 0, risk: 0 };
      current.scheduled += 1;
      if (decisionFor({ ...row, time_zone: timeZone }, conflictIds, now, todayKey)?.rank >= 650) current.risk += 1;
      counts.set(id, current);
    });
    return [...counts.values()].sort((a, b) => b.risk - a.risk || b.scheduled - a.scheduled).slice(0, 8);
  }, [candidateRows, conflictIds, now, timeZone, todayKey]);

  const signalCoverage = [
    { label: "Assignment ownership", ready: state.feedState.assignments || assignments.length > 0 },
    { label: "Appointment windows", ready: state.feedState["appointment-windows"] },
    { label: "Schedule conflicts", ready: state.feedState["schedule-conflicts"] },
    { label: "Routing signal", ready: state.feedState.routing && routing.length > 0 },
    { label: "Assignable workforce", ready: state.assignees.length > 0 },
    { label: "Skills / qualifications", ready: false, note: "Not evaluated" },
  ];

  const quickLinks = [
    ["Assignments", "assignments"],
    ["Appointment windows", "appointment-windows"],
    ["Routing", "routing"],
    ["Schedule conflicts", "schedule-conflicts"],
    ["Dispatch rules", "dispatch-rules"],
  ];

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-5 py-7 text-[#191919] md:px-8 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-[1780px]">
        <header className="flex flex-col gap-5 border-b border-black/[0.07] pb-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9A744B]">Operations / Dispatch</div>
            <h1 className="mt-2 text-[30px] font-medium tracking-[-0.04em] text-[#181817] md:text-[34px]">Dispatch Control</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#6C6963]">Run the service day by exception. Avantiqo surfaces where human judgment is required, shows the evidence behind the signal, and keeps healthy work quiet.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6C6963]">
            {[organizationName, entityName, periodName].map((label) => <span key={label} className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">{label}</span>)}
            <button type="button" onClick={() => load()} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143] shadow-[0_1px_2px_rgba(0,0,0,0.03)]" aria-label="Refresh Dispatch Control"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /></button>
          </div>
        </header>

        {state.error ? <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] p-3 text-[11px] text-[#8B4937]"><AlertTriangle size={13} />{state.error}</div> : null}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Needs intervention" value={state.loading ? "…" : decisions.length} detail="Human decisions surfaced now" attention />
          <Metric label="Scheduled today" value={state.loading ? "…" : todayRows.length} detail="Known work in today’s plan" />
          <Metric label="Overdue" value={state.loading ? "…" : overdue} detail="Commitments already late" attention />
          <Metric label="Unassigned" value={state.loading ? "…" : unassigned} detail="Work without ownership" attention />
          <Metric label="Priority" value={state.loading ? "…" : priority} detail="High-risk active work" attention />
          <Metric label="Completed today" value={state.loading ? "…" : completedToday} detail="Recorded daily throughput" />
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)] xl:items-start">
          <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.06] px-5 py-4">
              <div><div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">Decision queue</div><h2 className="mt-1 text-[17px] font-medium tracking-[-0.025em] text-[#23211E]">Dispatch decisions</h2><p className="mt-1 text-[10px] text-[#9A968E]">Conflict, commitment, ownership and priority signals only.</p></div>
              <div className="inline-flex items-center gap-1.5 text-[9px] text-[#AAA69E]"><ShieldCheck size={10} /> Human approval remains authoritative</div>
            </div>
            <div className="hidden grid-cols-[minmax(170px,0.8fr)_minmax(260px,1.2fr)_125px_125px_100px] gap-4 border-b border-black/[0.05] bg-[#FBFAF8] px-5 py-2 text-[8px] font-medium uppercase tracking-[0.1em] text-[#979087] lg:grid"><span>Work</span><span>Decision</span><span>Timing</span><span>Owner</span><span>State</span></div>
            <div className="divide-y divide-black/[0.055]">
              {!state.loading && decisions.length === 0 ? <div className="flex items-center gap-3 px-5 py-8 text-[12px] text-[#77736C]"><CheckCircle2 size={15} className="text-[#718167]" />No current dispatch exception needs intervention.</div> : null}
              {decisions.slice(0, 14).map(({ row, decision }) => (
                <Link key={`${row.capability_id || "work"}-${row.id}`} href={`/workspace/${encodeURIComponent(organizationId)}/operations/${row.capability_id || "work-orders"}`} className="group grid gap-2 px-5 py-3.5 transition hover:bg-[#FCFBF9] lg:grid-cols-[minmax(170px,0.8fr)_minmax(260px,1.2fr)_125px_125px_100px] lg:items-center lg:gap-4">
                  <div className="min-w-0"><div className="truncate text-[11px] font-medium text-[#403C37] group-hover:text-[#8D6338]">{row.name || row.code || titleCase(row.capability_id)}</div><div className="mt-0.5 truncate text-[8px] uppercase tracking-[0.07em] text-[#A09A92]">{titleCase(row.capability_id || row.record_type)}</div></div>
                  <div className="min-w-0"><div className="truncate text-[11px] font-medium text-[#3C3732]">{decision.title}</div><div className="mt-0.5 truncate text-[9px] text-[#8D857D]">{decision.detail}</div></div>
                  <div className="text-[9px] text-[#817A72]"><div className="flex items-center gap-1.5"><Clock3 size={9} className="text-[#A69F97]" />{formatDue(row.due_at || row.scheduled_start, timeZone)}</div></div>
                  <div className="flex items-center gap-1.5 truncate text-[9px] text-[#817A72]"><UserRound size={9} className="shrink-0 text-[#A69F97]" />{text(row.assigned_to) ? assigneeNames.get(text(row.assigned_to)) || "Assigned" : "Unassigned"}</div>
                  <div className="flex items-center justify-between gap-2"><span className={`rounded-full border px-2 py-1 text-[8px] font-medium uppercase tracking-[0.06em] ${stateTone(decision.state)}`}>{decision.state}</span><ArrowRight size={10} className="text-[#B7B3AB] group-hover:text-[#A37849]" /></div>
                </Link>
              ))}
            </div>
          </section>

          <div className="space-y-4">
            <section className="rounded-2xl border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">Service day</div><h2 className="mt-1 text-[16px] font-medium tracking-[-0.02em] text-[#23211E]">Today’s board</h2>
              <div className="mt-3 divide-y divide-black/[0.055]">
                {todayRows.slice(0, 8).map((row) => <div key={`today-${row.id}`} className="flex items-center gap-3 py-3"><div className="w-12 shrink-0 text-[10px] font-medium text-[#76583A]">{formatTime(row.scheduled_start || row.due_at, timeZone)}</div><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-medium text-[#4A4640]">{row.name || row.code || "Scheduled work"}</div><div className="mt-0.5 truncate text-[8px] text-[#99948C]">{text(row.assigned_to) ? assigneeNames.get(text(row.assigned_to)) || "Assigned" : "Unassigned"}</div></div></div>)}
                {!state.loading && todayRows.length === 0 ? <div className="py-5 text-[10px] text-[#99948C]">No scheduled work is recorded for today.</div> : null}
              </div>
            </section>

            <section className="rounded-2xl border border-[#A37849]/14 bg-[#FFFDF9] p-5">
              <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A633C]"><Route size={11} /> Optimization readiness</div>
              <div className="mt-3 divide-y divide-[#A37849]/10">
                {signalCoverage.map((signal) => <div key={signal.label} className="flex items-center justify-between gap-3 py-2.5 text-[10px]"><span className="text-[#746E66]">{signal.label}</span><span className={signal.ready ? "text-[#66735E]" : "text-[#9A968E]"}>{signal.ready ? "Available" : signal.note || "Unavailable"}</span></div>)}
              </div>
              <p className="mt-3 text-[9px] leading-4 text-[#918980]">Avantiqo does not invent skill, location or route scores. A recommendation can only use signals that are actually connected and governed.</p>
            </section>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.55fr)]">
          <section className="rounded-2xl border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex items-end justify-between gap-4 border-b border-black/[0.06] pb-3.5"><div><div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">Resource readiness</div><h2 className="mt-1 text-[15px] font-medium tracking-[-0.02em] text-[#23211E]">Known workload by owner</h2></div><div className="text-[9px] text-[#AAA69E]">Observed assignment only</div></div>
            <div className="mt-1 divide-y divide-black/[0.055]">
              {resourceRows.map((resource) => <div key={resource.id} className="grid grid-cols-[minmax(180px,1fr)_90px_90px] items-center gap-3 py-3 text-[10px]"><div className="flex min-w-0 items-center gap-2"><UserRound size={10} className="shrink-0 text-[#A69F97]" /><span className="truncate font-medium text-[#4A4640]">{assigneeNames.get(resource.id) || "Assigned resource"}</span></div><span className="text-[#77736C]">{resource.scheduled} work</span><span className={resource.risk ? "text-[#98513D]" : "text-[#77736C]"}>{resource.risk} at risk</span></div>)}
              {!state.loading && resourceRows.length === 0 ? <div className="py-5 text-[10px] text-[#99948C]">No accountable owner workload is currently visible.</div> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">Dispatch tools</div><h2 className="mt-1 text-[15px] font-medium tracking-[-0.02em] text-[#23211E]">Open a specialist control</h2>
            <div className="mt-2 divide-y divide-black/[0.055]">{quickLinks.map(([label, route]) => <Link key={route} href={`/workspace/${encodeURIComponent(organizationId)}/operations/${route}`} className="group flex items-center justify-between gap-3 py-3 text-[10px] text-[#5C5851] hover:text-[#8D6338]"><span className="flex items-center gap-2">{route === "routing" ? <MapPin size={10} className="text-[#A69F97]" /> : <ShieldCheck size={10} className="text-[#A69F97]" />}{label}</span><ArrowRight size={10} className="text-[#B7B3AB] group-hover:text-[#A37849]" /></Link>)}</div>
          </section>
        </div>

        {capability?.boundary ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#D6A66A]/16 bg-[#D6A66A]/[0.035] px-4 py-3 text-[9px] leading-4 text-[#756B60]"><ShieldCheck size={11} className="mt-0.5 shrink-0 text-[#8D6B45]" />{capability.boundary}</div> : null}
      </div>
    </main>
  );
}
