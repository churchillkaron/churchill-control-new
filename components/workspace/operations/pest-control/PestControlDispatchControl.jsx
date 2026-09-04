"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  MapPinned,
  RefreshCw,
  Route,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const DISPATCH_CAPABILITIES = Object.freeze([
  "work-orders",
  "appointment-windows",
  "dispatch",
  "assignments",
  "routing",
  "schedule-conflicts",
  "resource-availability",
]);

const PRIMARY_WORK_CAPABILITIES = new Set([
  "work-orders",
  "appointment-windows",
  "dispatch",
]);

const WORK_CAPABILITY_PRIORITY = Object.freeze({
  "work-orders": 1,
  "appointment-windows": 2,
  dispatch: 3,
});

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

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function titleCase(value) {
  return text(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function hrefFor(organizationId, capabilityId) {
  return `/workspace/${encodeURIComponent(organizationId)}/operations/${encodeURIComponent(capabilityId)}`;
}

function ownerLabel(value) {
  const owner = text(value);
  if (!owner) return "Unassigned";
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(owner)) {
    return `Resource ${owner.slice(0, 8)}`;
  }
  return owner;
}

function workKey(row) {
  return text(row?.source_id) || text(row?.id);
}

function compareScheduled(a, b) {
  const aTime = dateValue(a?.scheduled_start || a?.due_at)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bTime = dateValue(b?.scheduled_start || b?.due_at)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (aTime !== bTime) return aTime - bTime;
  return Number(b?.rank_score || 0) - Number(a?.rank_score || 0);
}

function selectPrimaryToday(rows) {
  const candidates = rows.filter((row) => PRIMARY_WORK_CAPABILITIES.has(row?.capability_id));
  const selected = new Map();

  for (const row of candidates) {
    const key = workKey(row);
    if (!key) continue;
    const current = selected.get(key);
    const currentPriority = WORK_CAPABILITY_PRIORITY[current?.capability_id] || 99;
    const nextPriority = WORK_CAPABILITY_PRIORITY[row?.capability_id] || 99;
    if (!current || nextPriority < currentPriority) selected.set(key, row);
  }

  return [...selected.values()].sort(compareScheduled);
}

function overlapIds(rows) {
  const ids = new Set();
  const byOwner = new Map();

  for (const row of rows) {
    const owner = text(row?.assigned_to);
    const start = dateValue(row?.scheduled_start);
    const end = dateValue(row?.scheduled_end);
    if (!owner || !start || !end) continue;
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner).push({ row, start, end });
  }

  for (const lane of byOwner.values()) {
    lane.sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let index = 1; index < lane.length; index += 1) {
      const previous = lane[index - 1];
      const current = lane[index];
      if (current.start.getTime() < previous.end.getTime()) {
        ids.add(previous.row.id);
        ids.add(current.row.id);
      }
    }
  }

  return ids;
}

function rowRisk(row, overlaps) {
  if (overlaps.has(row?.id)) {
    return {
      score: 1200,
      state: "CONFLICT",
      title: "Timing collision",
      detail: "This technician lane contains overlapping committed work. Resolve the collision before changing healthy stops.",
    };
  }
  if (row?.overdue) {
    return {
      score: 1100,
      state: "OVERDUE",
      title: "Recover missed commitment",
      detail: "The service commitment is already late. Protect it before optimizing route density.",
    };
  }
  if (!text(row?.assigned_to)) {
    return {
      score: 900,
      state: "UNASSIGNED",
      title: "Assign eligible technician",
      detail: "Ownership is missing. Check availability, skills, location and the customer window before dispatch.",
    };
  }
  if (row?.due_soon) {
    return {
      score: 760,
      state: "DUE SOON",
      title: "Protect arrival window",
      detail: "The commitment is approaching its due time. Avoid a route change that creates a preventable service failure.",
    };
  }
  if (row?.high_priority) {
    return {
      score: 640,
      state: "PRIORITY",
      title: "Protect priority work",
      detail: "Keep timing, ownership and required execution controls intact before moving lower-priority work around it.",
    };
  }
  return {
    score: 100,
    state: "READY",
    title: "Route-ready",
    detail: "No surfaced schedule or ownership exception blocks this stop from today’s operating plan.",
  };
}

function toneFor(state) {
  const value = normalized(state);
  if (value.includes("conflict") || value.includes("overdue")) {
    return "border-[#B36B52]/20 bg-[#B36B52]/[0.07] text-[#98513D]";
  }
  if (value.includes("unassigned") || value.includes("due_soon") || value.includes("priority")) {
    return "border-[#C08A4A]/20 bg-[#C08A4A]/[0.08] text-[#8B6236]";
  }
  return "border-[#748267]/18 bg-[#748267]/[0.06] text-[#607057]";
}

function Metric({ label, value, detail, attention = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-[#FBFAF8] px-4 py-3.5">
      <div className="text-[8px] font-medium uppercase tracking-[0.14em] text-[#918C84]">{label}</div>
      <div className={`mt-2 text-[21px] font-medium tracking-[-0.035em] ${attention && Number(value) > 0 ? "text-[#98513D]" : "text-[#26231F]"}`}>
        {value}
      </div>
      <div className="mt-1 text-[9px] leading-4 text-[#9A968E]">{detail}</div>
    </div>
  );
}

function DispatchRow({ row, risk, organizationId }) {
  const start = formatTime(row.scheduled_start || row.due_at);
  const end = formatTime(row.scheduled_end);
  const window = end === "—" ? start : `${start}–${end}`;

  return (
    <Link
      href={hrefFor(organizationId, row.capability_id)}
      className="group grid gap-2 px-4 py-3.5 transition hover:bg-[#FCFBF9] md:grid-cols-[92px_minmax(150px,0.8fr)_minmax(220px,1.2fr)_145px_100px] md:items-center md:gap-4"
    >
      <div className="text-[9px] font-medium text-[#625D56]">{window}</div>
      <div className="min-w-0">
        <div className="truncate text-[10px] font-medium text-[#403C37] group-hover:text-[#8D6338]">
          {row.name || row.code || titleCase(row.capability_id)}
        </div>
        <div className="mt-0.5 truncate text-[8px] uppercase tracking-[0.06em] text-[#A09A92]">{titleCase(row.capability_id)}</div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[10px] font-medium text-[#45413B]">{risk.title}</div>
        <div className="mt-0.5 truncate text-[8px] text-[#989189]">{risk.detail}</div>
      </div>
      <div className="flex items-center gap-1.5 text-[8px] text-[#817A72]">
        <UserRound size={9} /> {ownerLabel(row.assigned_to)}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full border px-2 py-1 text-[7px] font-medium uppercase tracking-[0.06em] ${toneFor(risk.state)}`}>{risk.state}</span>
        <ArrowRight size={10} className="text-[#B7B3AB] group-hover:text-[#A37849]" />
      </div>
    </Link>
  );
}

function TechnicianLane({ owner, rows, overlaps }) {
  const ordered = [...rows].sort(compareScheduled);
  const first = dateValue(ordered[0]?.scheduled_start || ordered[0]?.due_at);
  const last = dateValue(ordered[ordered.length - 1]?.scheduled_end || ordered[ordered.length - 1]?.due_at);
  const hasConflict = ordered.some((row) => overlaps.has(row.id));
  const gaps = [];

  for (let index = 1; index < ordered.length; index += 1) {
    const previousEnd = dateValue(ordered[index - 1]?.scheduled_end);
    const nextStart = dateValue(ordered[index]?.scheduled_start);
    if (!previousEnd || !nextStart) continue;
    gaps.push((nextStart.getTime() - previousEnd.getTime()) / 60000);
  }

  const positiveGaps = gaps.filter((value) => value > 0);
  const smallestGap = positiveGaps.length ? Math.min(...positiveGaps) : null;

  return (
    <div className="rounded-xl border border-black/[0.065] bg-[#FBFAF8] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-medium text-[#403C37]">{ownerLabel(owner)}</div>
          <div className="mt-0.5 text-[8px] text-[#99948C]">
            {ordered.length} {ordered.length === 1 ? "stop" : "stops"}
            {first ? ` · ${formatTime(first)}` : ""}
            {last ? `–${formatTime(last)}` : ""}
          </div>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[7px] font-medium uppercase tracking-[0.06em] ${toneFor(hasConflict ? "CONFLICT" : "READY")}`}>
          {hasConflict ? "Conflict" : "Ready"}
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        {ordered.slice(0, 6).map((row, index) => {
          const start = formatTime(row.scheduled_start || row.due_at);
          return (
            <div key={row.id} className="flex items-center gap-2 text-[8px] text-[#756F67]">
              <span className="w-10 shrink-0 font-medium text-[#5F5A53]">{start}</span>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${overlaps.has(row.id) ? "bg-[#A45E47]" : "bg-[#7F8C73]"}`} />
              <span className="min-w-0 flex-1 truncate">{row.name || row.code || `Stop ${index + 1}`}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-black/[0.05] pt-2.5 text-[7px] uppercase tracking-[0.07em] text-[#9C968F]">
        <span>{smallestGap !== null ? `Tightest gap ${formatDuration(smallestGap)}` : "No measured gap"}</span>
        <span>{hasConflict ? "Human decision required" : "Sequence healthy"}</span>
      </div>
    </div>
  );
}

export default function PestControlDispatchControl({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = text(businessContext.entity_id || businessContext.entity?.id);
  const periodId = text(businessContext.period_id || businessContext.period?.id);
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (!silent) setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const query = new URLSearchParams({
        organization_id: organizationId,
        capabilities: DISPATCH_CAPABILITIES.join(","),
      });
      if (entityId) query.set("entity_id", entityId);
      if (periodId) query.set("period_id", periodId);

      const response = await fetch(`/api/operations/command-center?${query.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Today’s dispatch state could not be loaded");
      }
      setState({ loading: false, error: null, data: result });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Today’s dispatch state could not be loaded",
      }));
    }
  }, [entityId, organizationId, periodId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => load({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const intelligence = useMemo(() => {
    const today = Array.isArray(state.data?.today) ? state.data.today : [];
    const primaryToday = selectPrimaryToday(today);
    const overlaps = overlapIds(primaryToday);
    const riskRows = primaryToday
      .map((row) => ({ row, risk: rowRisk(row, overlaps) }))
      .sort((a, b) => b.risk.score - a.risk.score || compareScheduled(a.row, b.row));
    const exceptionRows = riskRows.filter(({ risk }) => risk.state !== "READY");
    const lanes = new Map();

    for (const row of primaryToday) {
      const owner = text(row.assigned_to) || "__unassigned__";
      if (!lanes.has(owner)) lanes.set(owner, []);
      lanes.get(owner).push(row);
    }

    const capabilityState = state.data?.capabilities || {};
    const scheduleConflictRecords = Number(capabilityState?.["schedule-conflicts"]?.active || 0);
    const overlapCount = overlaps.size;
    const unassigned = primaryToday.filter((row) => !text(row.assigned_to)).length;
    const routeReady = primaryToday.filter((row) => rowRisk(row, overlaps).state === "READY").length;

    return {
      primaryToday,
      riskRows,
      exceptionRows,
      overlaps,
      lanes: [...lanes.entries()].sort(([a], [b]) => {
        if (a === "__unassigned__") return -1;
        if (b === "__unassigned__") return 1;
        return ownerLabel(a).localeCompare(ownerLabel(b));
      }),
      unassigned,
      routeReady,
      conflictSignals: scheduleConflictRecords + overlapCount,
      routingActive: Number(capabilityState?.routing?.active || 0),
    };
  }, [state.data]);

  const dispatchHref = hrefFor(organizationId, "dispatch");
  const routingHref = hrefFor(organizationId, "routing");
  const conflictHref = hrefFor(organizationId, "schedule-conflicts");

  return (
    <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.06] px-5 py-4">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#9A744B]"><Route size={11} /> Today’s dispatch control</div>
          <h2 className="mt-1 text-[17px] font-medium tracking-[-0.025em] text-[#23211E]">Protect commitments before optimizing distance</h2>
          <p className="mt-1 max-w-4xl text-[10px] leading-4 text-[#9A968E]">
            Server-ranked work, technician ownership and schedule collisions are combined into one decision surface. Route density stays important, but never overrides overdue work, customer windows or governed assignment constraints.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={dispatchHref} className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] px-3 py-2 text-[9px] font-medium text-[#7F5E3D]">
            Open dispatch <ArrowRight size={9} />
          </Link>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143] transition hover:border-[#D6A66A]/45"
            aria-label="Refresh today’s dispatch control"
          >
            <RefreshCw size={11} className={state.loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {state.error ? (
        <div className="m-5 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-3.5 py-3 text-[10px] leading-4 text-[#8B4937]">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {state.error}
        </div>
      ) : null}

      <div className="p-5">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Metric label="Today’s work" value={state.loading ? "…" : intelligence.primaryToday.length} detail="Deduplicated scheduled commitments" />
          <Metric label="Needs decision" value={state.loading ? "…" : intelligence.exceptionRows.length} detail="Conflict, overdue, unassigned or protected work" attention />
          <Metric label="Unassigned" value={state.loading ? "…" : intelligence.unassigned} detail="Today’s work without accountable technician" attention />
          <Metric label="Route ready" value={state.loading ? "…" : `${intelligence.routeReady}/${intelligence.primaryToday.length}`} detail="Healthy stops with no surfaced blocker" />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <div className="overflow-hidden rounded-xl border border-black/[0.065]">
            <div className="flex items-center justify-between gap-3 border-b border-black/[0.055] bg-[#FBFAF8] px-4 py-3">
              <div>
                <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">Decision queue</div>
                <div className="mt-0.5 text-[9px] text-[#A09A92]">The highest-consequence dispatch decisions appear first. Healthy work stays below them.</div>
              </div>
              <span className="text-[12px] font-medium text-[#3A3631]">{state.loading ? "…" : intelligence.exceptionRows.length}</span>
            </div>

            <div className="hidden grid-cols-[92px_minmax(150px,0.8fr)_minmax(220px,1.2fr)_145px_100px] gap-4 border-b border-black/[0.05] bg-[#FDFCFB] px-4 py-2 text-[7px] font-medium uppercase tracking-[0.08em] text-[#9B958D] md:grid">
              <span>Window</span><span>Work</span><span>Decision</span><span>Technician</span><span>State</span>
            </div>

            <div className="divide-y divide-black/[0.055]">
              {!state.loading && intelligence.primaryToday.length === 0 ? (
                <div className="flex items-center gap-2.5 px-4 py-6 text-[10px] text-[#77736C]">
                  <CheckCircle2 size={13} className="text-[#718167]" />
                  No scheduled field-service work is surfaced for today.
                </div>
              ) : null}
              {intelligence.riskRows.slice(0, 10).map(({ row, risk }) => (
                <DispatchRow key={row.id} row={row} risk={risk} organizationId={organizationId} />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-black/[0.065] bg-[#FBFAF8] p-4">
              <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A867F]"><ShieldCheck size={10} /> Optimization guardrails</div>
              <div className="mt-3 space-y-2.5 text-[9px] leading-4 text-[#777169]">
                <div className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#9A744B]" /><span><strong className="font-medium text-[#4A4640]">Customer commitment first.</strong> Overdue and near-due windows outrank route density.</span></div>
                <div className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#9A744B]" /><span><strong className="font-medium text-[#4A4640]">Eligibility before proximity.</strong> Assignment must preserve workforce availability and qualification rules.</span></div>
                <div className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#9A744B]" /><span><strong className="font-medium text-[#4A4640]">No silent collisions.</strong> Overlapping technician windows remain a human-visible exception.</span></div>
                <div className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#9A744B]" /><span><strong className="font-medium text-[#4A4640]">Optimize with evidence.</strong> Routing can propose a sequence, but dispatch remains governed and auditable.</span></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Link href={conflictHref} className="rounded-xl border border-black/[0.065] bg-white p-3.5 transition hover:border-[#D6A66A]/35">
                <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.1em] text-[#918C84]"><AlertTriangle size={9} /> Conflict signals</div>
                <div className={`mt-2 text-[18px] font-medium ${intelligence.conflictSignals > 0 ? "text-[#98513D]" : "text-[#2C2925]"}`}>{state.loading ? "…" : intelligence.conflictSignals}</div>
                <div className="mt-1 text-[8px] leading-3 text-[#99948C]">Recorded conflicts plus detected lane overlaps</div>
              </Link>
              <Link href={routingHref} className="rounded-xl border border-black/[0.065] bg-white p-3.5 transition hover:border-[#D6A66A]/35">
                <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.1em] text-[#918C84]"><MapPinned size={9} /> Routing plans</div>
                <div className="mt-2 text-[18px] font-medium text-[#2C2925]">{state.loading ? "…" : intelligence.routingActive}</div>
                <div className="mt-1 text-[8px] leading-3 text-[#99948C]">Active governed routing records</div>
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-black/[0.065] p-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/[0.05] pb-3">
            <div>
              <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">Technician lanes</div>
              <div className="mt-0.5 text-[9px] text-[#A09A92]">Chronological daily load with explicit collision and gap signals. Distance optimization remains a separate governed routing decision.</div>
            </div>
            <div className="flex items-center gap-1.5 text-[8px] text-[#9A958D]"><Clock3 size={9} /> Live schedule windows</div>
          </div>

          <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {!state.loading && intelligence.lanes.length === 0 ? (
              <div className="col-span-full flex items-center gap-2.5 rounded-xl bg-[#FBFAF8] px-4 py-5 text-[10px] text-[#77736C]">
                <UserRound size={12} /> No technician lanes are scheduled for today.
              </div>
            ) : null}
            {intelligence.lanes.slice(0, 9).map(([owner, rows]) => (
              <TechnicianLane key={owner} owner={owner === "__unassigned__" ? "" : owner} rows={rows} overlaps={intelligence.overlaps} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
