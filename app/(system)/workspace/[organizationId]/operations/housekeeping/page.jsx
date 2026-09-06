"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock3, Play, RefreshCw, RotateCcw, Wrench, XCircle } from "lucide-react";

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

const RECLEAN_REASONS = ["LINEN", "BATHROOM", "SURFACES", "FLOOR", "AMENITIES", "ODOUR", "OTHER"];
const MAINTENANCE_REASONS = ["PLUMBING", "ELECTRICAL", "HVAC", "FIXTURE", "SAFETY", "DAMAGE", "OTHER"];

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
  const [inspectionTaskId, setInspectionTaskId] = useState(null);
  const [inspection, setInspection] = useState({ outcome: "PASS", reasonCode: "", notes: "", maintenancePriority: "HIGH" });
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

  function openInspection(taskId) {
    setInspectionTaskId(taskId);
    setInspection({ outcome: "PASS", reasonCode: "", notes: "", maintenancePriority: "HIGH" });
    setError(null);
  }

  async function submitInspection(taskId) {
    if (!taskId) return;
    if (inspection.outcome !== "PASS" && !inspection.reasonCode) {
      setError("Choose why the room failed inspection before continuing.");
      return;
    }
    setBusyTaskId(taskId);
    setError(null);
    try {
      const response = await fetch("/api/hotel/housekeeping/inspect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, ...inspection }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Housekeeping inspection failed");
      setInspectionTaskId(null);
      await loadPlan({ silent: true });
      notifyHotelReadinessChanged({ source: "housekeeping-inspection", taskId, outcome: inspection.outcome });
    } catch (inspectionError) {
      setError(inspectionError?.message || "Housekeeping inspection failed");
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
      subtitle="A live clean-next and inspect-next plan derived from guest risk, property business day, recorded arrival ETA, VIP evidence, room state and maintenance. Cleaning never releases a room by itself: QC must pass, reclean, or hand a physical defect to Maintenance."
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
        <HotelMetric label="Inspect next" value={summary.inspectionReady || 0} detail="QC pass is the release authority" attention={(summary.inspectionReady || 0) > 0} />
      </section>

      {unconfiguredOperationalDays > 0 ? (
        <HotelSection eyebrow="Clock authority" title="Arrival urgency is intentionally fail-closed" detail="The property operational-day configuration is not yet applied for one or more rooms. Avantiqo will rank physical work, but it will not use browser time or server UTC to fabricate who is due today.">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-2 text-[8px] font-semibold text-[#765A3F]"><Clock3 size={12} />{unconfiguredOperationalDays} task(s) waiting for governed property-clock authority · {configuredOperationalDays} configured</div>
            <HotelSecondaryAction href={hotelWorkspaceHref(organizationId, "configuration")}>Configure property clock</HotelSecondaryAction>
          </div>
        </HotelSection>
      ) : null}

      <HotelSection eyebrow="Live orchestration" title="What Housekeeping should do next" detail="Rank is re-derived from live Hotel truth. Inspection is a real control point: pass releases, reclean returns the room to Housekeeping, and a physical defect hands ownership to Maintenance without marking the room ready.">
        {loading ? <HotelEmptyState>Building live Housekeeping priority…</HotelEmptyState> : items.length ? (
          <div className="divide-y divide-black/[0.055]">
            <div className="hidden grid-cols-[54px_105px_minmax(250px,1fr)_140px_175px] gap-3 bg-[#FCFBF8] px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#969087] md:grid"><span>Rank</span><span>Room</span><span>Why now</span><span>State</span><span>Next move</span></div>
            {items.map((item) => {
              const task = item.task || {};
              const room = item.room || {};
              const taskStatus = normalizeStatus(task);
              const busy = busyTaskId === task.id;
              const blocked = item.nextAction === "RESOLVE_MAINTENANCE";
              const inspectionOpen = inspectionTaskId === task.id;
              const reasons = inspection.outcome === "RECLEAN" ? RECLEAN_REASONS : MAINTENANCE_REASONS;
              return (
                <div key={task.id}>
                  <div className="grid gap-2 px-4 py-4 md:grid-cols-[54px_105px_minmax(250px,1fr)_140px_175px] md:items-start md:gap-3 md:px-5">
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
                      {item.arrival ? <div className="mt-1 text-[8px] font-semibold text-[#5F5952]">{item.arrival.guestName || "Assigned arrival"} · {etaLabel(item.arrival)}</div> : null}
                      <div className="mt-1.5 space-y-0.5">{(item.why || []).map((reason, index) => <div key={`${task.id}-${index}`} className="text-[7px] leading-3 text-[#8F887F]">{reason}</div>)}</div>
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
                        <HotelPrimaryAction onClick={() => openInspection(task.id)} disabled={busy}><CheckCircle2 size={9} />Inspect room</HotelPrimaryAction>
                      )}
                    </div>
                  </div>

                  {inspectionOpen ? (
                    <div className="border-t border-black/[0.045] bg-[#FCFBF8] px-4 py-4 md:px-5">
                      <div className="grid gap-3 lg:grid-cols-[170px_180px_150px_minmax(220px,1fr)_auto] lg:items-end">
                        <label className="block">
                          <span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Inspection outcome</span>
                          <select className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px]" value={inspection.outcome} onChange={(event) => setInspection((current) => ({ ...current, outcome: event.target.value, reasonCode: "" }))}>
                            <option value="PASS">Pass — release room</option>
                            <option value="RECLEAN">Fail — reclean</option>
                            <option value="MAINTENANCE">Fail — maintenance</option>
                          </select>
                        </label>
                        {inspection.outcome !== "PASS" ? (
                          <label className="block">
                            <span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Reason</span>
                            <select className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px]" value={inspection.reasonCode} onChange={(event) => setInspection((current) => ({ ...current, reasonCode: event.target.value }))}>
                              <option value="">Choose reason</option>
                              {reasons.map((reason) => <option key={reason} value={reason}>{reason.replaceAll("_", " ")}</option>)}
                            </select>
                          </label>
                        ) : <div />}
                        {inspection.outcome === "MAINTENANCE" ? (
                          <label className="block">
                            <span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Priority</span>
                            <select className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px]" value={inspection.maintenancePriority} onChange={(event) => setInspection((current) => ({ ...current, maintenancePriority: event.target.value }))}>
                              <option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
                            </select>
                          </label>
                        ) : <div />}
                        <label className="block">
                          <span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">Inspector note</span>
                          <input className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px]" value={inspection.notes} onChange={(event) => setInspection((current) => ({ ...current, notes: event.target.value }))} placeholder={inspection.outcome === "PASS" ? "Optional" : "What did you find?"} />
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          <HotelSecondaryAction onClick={() => setInspectionTaskId(null)} disabled={busy}><XCircle size={9} />Cancel</HotelSecondaryAction>
                          <HotelPrimaryAction onClick={() => submitInspection(task.id)} disabled={busy}>
                            {inspection.outcome === "PASS" ? <CheckCircle2 size={9} /> : inspection.outcome === "RECLEAN" ? <RotateCcw size={9} /> : <Wrench size={9} />}
                            {busy ? "Saving" : inspection.outcome === "PASS" ? "Pass & release" : inspection.outcome === "RECLEAN" ? "Send to reclean" : "Create maintenance"}
                          </HotelPrimaryAction>
                        </div>
                      </div>
                      <div className="mt-2 text-[7px] leading-3 text-[#918A82]">Pass is the only outcome that can release the room. Reclean keeps Housekeeping ownership. Maintenance creates/reuses the canonical room defect and requires a new QC pass after repair.</div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : <HotelEmptyState>No active room-readiness work. Housekeeping is clear.</HotelEmptyState>}
      </HotelSection>
    </HotelWorkspaceShell>
  );
}
