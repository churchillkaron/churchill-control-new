"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock3, Play, RefreshCw, Wrench } from "lucide-react";

import HotelArrivalReadinessOwnership from "@/components/workspace/hotel/HotelArrivalReadinessOwnership";
import {
  HotelEmptyState,
  HotelError,
  HotelMetric,
  HotelPrimaryAction,
  HotelSecondaryAction,
  HotelSection,
  HotelStatusPill,
  HotelWorkspaceShell,
  hotelWorkspaceHref,
} from "@/components/workspace/hotel/HotelWorkspaceUI";
import { notifyHotelReadinessChanged } from "@/lib/hotel/client/readinessInvalidation";

function normalizeStatus(task) {
  return String(task?.task_status || "PENDING").toUpperCase();
}

function roomLabel(item) {
  return item?.room?.room_number || item?.task?.room_id || "Unassigned room";
}

function etaLabel(arrival) {
  if (!arrival) return null;
  if (arrival.minutesUntilEta === null || arrival.minutesUntilEta === undefined) return "ETA not recorded";
  if (arrival.minutesUntilEta <= 0) return "Guest due now";
  if (arrival.minutesUntilEta < 60) return `${arrival.minutesUntilEta} min to ETA`;
  const hours = Math.floor(arrival.minutesUntilEta / 60);
  const minutes = arrival.minutesUntilEta % 60;
  return `${hours}h ${minutes}m to ETA`;
}

function urgencyTone(value) {
  if (["GUEST_DUE_NOW", "ARRIVAL_WITHIN_60_MIN"].includes(value)) return "critical";
  if (["VIP_QC_REQUIRED", "QC_BLOCKING_ARRIVAL", "VIP_ARRIVAL_TODAY", "ARRIVAL_TODAY"].includes(value)) return "attention";
  return undefined;
}

function urgencyLabel(value) {
  const labels = {
    GUEST_DUE_NOW: "GUEST DUE NOW",
    ARRIVAL_WITHIN_60_MIN: "ARRIVAL < 60 MIN",
    VIP_QC_REQUIRED: "VIP · QC NEXT",
    QC_BLOCKING_ARRIVAL: "QC BLOCKING ARRIVAL",
    VIP_ARRIVAL_TODAY: "VIP ARRIVAL",
    ARRIVAL_TODAY: "ARRIVAL TODAY",
    ROUTINE: "ROUTINE",
  };
  return labels[value] || value || "ROUTINE";
}

export default function OperationsHousekeepingPage() {
  const params = useParams();
  const organizationId = params?.organizationId || null;
  const [plan, setPlan] = useState({ items: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [error, setError] = useState(null);

  const loadPlan = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (silent) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/hotel/housekeeping/priority-plan?organizationId=${encodeURIComponent(organizationId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Unable to build Housekeeping priority plan");
      setPlan(result);
    } catch (loadError) {
      setError(loadError?.message || "Unable to build Housekeeping priority plan");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  async function transition(taskId, action) {
    if (!taskId) return;
    setBusyTaskId(taskId);
    setError(null);
    try {
      const response = await fetch("/api/hotel/housekeeping/update", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Housekeeping transition failed");
      await loadPlan({ silent: true });
      notifyHotelReadinessChanged({ source: "housekeeping", taskId, action });
    } catch (transitionError) {
      setError(transitionError?.message || "Housekeeping transition failed");
    } finally {
      setBusyTaskId(null);
    }
  }

  const items = plan?.items || [];
  const summary = plan?.summary || {};
  const configuredOperationalDays = items.filter((item) => item?.operationalDay?.configured).length;
  const unconfiguredOperationalDays = items.filter((item) => item?.operationalDay && !item.operationalDay.configured).length;

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="housekeeping"
      title="Housekeeping"
      subtitle="A live clean-next and inspect-next plan derived from guest risk, property business day, recorded arrival ETA, VIP evidence, room state and maintenance. Avantiqo recommends the next physical move; people still execute and confirm the work."
      actions={<>
        <HotelPrimaryAction href={hotelWorkspaceHref(organizationId, "front-desk")}>Front Desk</HotelPrimaryAction>
        <HotelSecondaryAction onClick={() => loadPlan({ silent: true })} disabled={refreshing}><RefreshCw size={9} className={refreshing ? "animate-spin" : ""} />Refresh</HotelSecondaryAction>
      </>}
    >
      <HotelError>{error}</HotelError>

      <HotelArrivalReadinessOwnership organizationId={organizationId} focusOwner="HOUSEKEEPING" compact />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <HotelMetric label="Active room work" value={summary.active || 0} detail="Live physical readiness tasks" attention={(summary.active || 0) > 0} />
        <HotelMetric label="Arrival critical" value={summary.arrivalCritical || 0} detail="Priority proven from property-day truth" attention={(summary.arrivalCritical || 0) > 0} />
        <HotelMetric label="Maintenance blocked" value={summary.maintenanceBlocked || 0} detail="Cleaning alone cannot release these rooms" attention={(summary.maintenanceBlocked || 0) > 0} />
        <HotelMetric label="Inspect next" value={summary.inspectionReady || 0} detail="Shortest safe path to AVAILABLE" attention={(summary.inspectionReady || 0) > 0} />
      </section>

      {unconfiguredOperationalDays > 0 ? (
        <HotelSection eyebrow="Clock authority" title="Arrival urgency is intentionally fail-closed" detail="The property operational-day configuration is not yet applied for one or more rooms. Avantiqo will rank physical work, but it will not use browser time or server UTC to fabricate who is due today.">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-2 text-[8px] font-semibold text-[#765A3F]"><Clock3 size={12} />{unconfiguredOperationalDays} task(s) waiting for governed property-clock authority · {configuredOperationalDays} configured</div>
            <HotelSecondaryAction href={hotelWorkspaceHref(organizationId, "configuration")}>Configure property clock</HotelSecondaryAction>
          </div>
        </HotelSection>
      ) : null}

      <HotelSection eyebrow="Live orchestration" title="What Housekeeping should do next" detail="Rank is re-derived on every refresh. A guest due now outranks routine turnover; an inspection that can release an arrival room outranks starting another clean; unresolved maintenance never masquerades as Housekeeping completion.">
        {loading ? <HotelEmptyState>Building live Housekeeping priority…</HotelEmptyState> : items.length ? (
          <div className="divide-y divide-black/[0.055]">
            <div className="hidden grid-cols-[54px_105px_minmax(250px,1fr)_140px_155px] gap-3 bg-[#FCFBF8] px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#969087] md:grid"><span>Rank</span><span>Room</span><span>Why now</span><span>State</span><span>Next move</span></div>
            {items.map((item) => {
              const task = item.task || {};
              const room = item.room || {};
              const taskStatus = normalizeStatus(task);
              const busy = busyTaskId === task.id;
              const blocked = item.nextAction === "RESOLVE_MAINTENANCE";
              return (
                <div key={task.id} className="grid gap-2 px-4 py-4 md:grid-cols-[54px_105px_minmax(250px,1fr)_140px_155px] md:items-start md:gap-3 md:px-5">
                  <div className="text-[18px] font-light text-[#B9A184]">#{item.rank}</div>
                  <div>
                    <div className="text-[10px] font-semibold text-[#403C37]">{roomLabel(item)}</div>
                    <div className="mt-0.5 text-[7px] text-[#9A948B]">{room.room_type || "Room"}</div>
                    <div className="mt-1"><HotelStatusPill value={room.status || "UNKNOWN"} /></div>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <HotelStatusPill value={urgencyLabel(item.urgencyBand)} tone={urgencyTone(item.urgencyBand)} />
                      {item.arrival?.vipStatus && String(item.arrival.vipStatus).toUpperCase() !== "STANDARD" ? <HotelStatusPill value={item.arrival.vipStatus} tone="attention" /> : null}
                      {item.maintenance ? <HotelStatusPill value="MAINTENANCE BLOCK" tone="critical" /> : null}
                    </div>
                    {item.arrival ? (
                      <div className="mt-1 text-[8px] font-semibold text-[#5F5952]">
                        {item.arrival.guestName || "Assigned arrival"} · {etaLabel(item.arrival)}
                      </div>
                    ) : null}
                    <div className="mt-1.5 space-y-0.5">
                      {(item.why || []).map((reason, index) => <div key={`${task.id}-${index}`} className="text-[7px] leading-3 text-[#8F887F]">{reason}</div>)}
                    </div>
                    {item.maintenance ? <div className="mt-1 text-[7px] font-semibold text-[#8B5E50]">{item.maintenance.title || "Maintenance issue"} · {item.maintenance.priority || "priority unknown"}</div> : null}
                  </div>
                  <div className="space-y-1">
                    <HotelStatusPill value={taskStatus} tone={taskStatus === "AWAITING_INSPECTION" ? "attention" : undefined} />
                    <div className="text-[7px] text-[#9A948B]">{item.operationalDay?.configured ? `Business day ${item.operationalDay.businessDate}` : "Business day authority unavailable"}</div>
                  </div>
                  <div>
                    {blocked ? (
                      <HotelPrimaryAction href={hotelWorkspaceHref(organizationId, "maintenance")}><Wrench size={9} />Resolve maintenance</HotelPrimaryAction>
                    ) : taskStatus === "PENDING" ? (
                      <HotelPrimaryAction onClick={() => transition(task.id, "START")} disabled={busy}><Play size={9} />{busy ? "Starting" : "Start cleaning"}</HotelPrimaryAction>
                    ) : taskStatus === "IN_PROGRESS" ? (
                      <HotelPrimaryAction onClick={() => transition(task.id, "COMPLETE")} disabled={busy}><CheckCircle2 size={9} />{busy ? "Updating" : "Mark clean"}</HotelPrimaryAction>
                    ) : (
                      <HotelPrimaryAction onClick={() => transition(task.id, "INSPECT")} disabled={busy}><CheckCircle2 size={9} />{busy ? "Releasing" : "Inspect & release"}</HotelPrimaryAction>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <HotelEmptyState>No active room-readiness work. Housekeeping is clear.</HotelEmptyState>}
      </HotelSection>
    </HotelWorkspaceShell>
  );
}
