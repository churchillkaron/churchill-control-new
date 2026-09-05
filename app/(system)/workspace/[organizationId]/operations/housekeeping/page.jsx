"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Play, RefreshCw } from "lucide-react";

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

const STATUS_ORDER = Object.freeze(["AWAITING_INSPECTION", "IN_PROGRESS", "PENDING", "COMPLETED"]);
const ACTIVE_STATUS_PRIORITY = Object.freeze({ AWAITING_INSPECTION: 0, IN_PROGRESS: 1, PENDING: 2 });

function normalizeStatus(task) {
  return String(task?.task_status || "PENDING").toUpperCase();
}

function roomLabel(task) {
  const room = task?.hotel_rooms;
  return room?.room_number || room?.name || task?.room_id || "Unassigned room";
}

function elapsedLabel(value) {
  const timestamp = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(timestamp)) return null;
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function stageDetail(task) {
  const taskStatus = normalizeStatus(task);
  if (taskStatus === "IN_PROGRESS") return `Cleaning started ${elapsedLabel(task?.updated_at) || "recently"}`;
  if (taskStatus === "AWAITING_INSPECTION") return `Cleaning finished ${elapsedLabel(task?.updated_at) || "recently"} · QC required`;
  if (taskStatus === "COMPLETED") return `Released ${elapsedLabel(task?.completed_at || task?.updated_at) || "recently"}`;
  return task?.scheduled_at ? `Scheduled ${new Date(task.scheduled_at).toLocaleString()}` : "Waiting to be started";
}

function activePriority(task) {
  const arrivalPriority = task?.arrival_waiting ? 0 : 1;
  const stagePriority = ACTIVE_STATUS_PRIORITY[normalizeStatus(task)] ?? 9;
  const scheduled = task?.scheduled_at ? new Date(task.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
  return [arrivalPriority, stagePriority, Number.isFinite(scheduled) ? scheduled : Number.MAX_SAFE_INTEGER];
}

export default function OperationsHousekeepingPage() {
  const params = useParams();
  const organizationId = params?.organizationId || null;
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [error, setError] = useState(null);

  const loadTasks = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (silent) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/hotel/housekeeping/list?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store", credentials: "include" });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Unable to load housekeeping tasks");
      setTasks(result.tasks || []);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load housekeeping tasks");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const groupedTasks = useMemo(() => Object.fromEntries(STATUS_ORDER.map((taskStatus) => [taskStatus, tasks.filter((task) => normalizeStatus(task) === taskStatus)])), [tasks]);
  const activeTasks = useMemo(() => tasks
    .filter((task) => ["PENDING", "IN_PROGRESS", "AWAITING_INSPECTION"].includes(normalizeStatus(task)))
    .sort((a, b) => {
      const left = activePriority(a);
      const right = activePriority(b);
      return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
    }), [tasks]);
  const today = new Date().toISOString().slice(0, 10);
  const releasedToday = (groupedTasks.COMPLETED || []).filter((task) => String(task?.completed_at || task?.updated_at || "").slice(0, 10) === today).length;
  const arrivalsWaiting = activeTasks.filter((task) => task?.arrival_waiting).length;

  async function transition(taskId, action) {
    if (!organizationId || !taskId) return;
    setBusyTaskId(taskId); setError(null);
    try {
      const response = await fetch("/api/hotel/housekeeping/update", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, taskId, action }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Housekeeping transition failed");
      await loadTasks({ silent: true });
    } catch (transitionError) {
      setError(transitionError?.message || "Housekeeping transition failed");
    } finally { setBusyTaskId(null); }
  }

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="housekeeping"
      title="Housekeeping"
      subtitle="Turn rooms safely from dirty to cleaning to clean/QC to guest-ready inventory. Rooms blocking an arrival are prioritized before routine turnover; only explicit inspection releases a cleaned room to Front Desk."
      actions={<>
        <HotelPrimaryAction href={hotelWorkspaceHref(organizationId, "front-desk")}>Front Desk</HotelPrimaryAction>
        <HotelSecondaryAction onClick={() => loadTasks({ silent: true })} disabled={refreshing}><RefreshCw size={9} className={refreshing ? "animate-spin" : ""} />Refresh</HotelSecondaryAction>
      </>}
    >
      <HotelError>{error}</HotelError>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <HotelMetric label="Waiting" value={groupedTasks.PENDING?.length || 0} detail={`${arrivalsWaiting} active task(s) block an arrival`} attention={(groupedTasks.PENDING?.length || 0) > 0} />
        <HotelMetric label="Cleaning" value={groupedTasks.IN_PROGRESS?.length || 0} detail="Rooms actively being turned" attention={(groupedTasks.IN_PROGRESS?.length || 0) > 0} />
        <HotelMetric label="QC required" value={groupedTasks.AWAITING_INSPECTION?.length || 0} detail="Clean, not yet guest-ready" attention={(groupedTasks.AWAITING_INSPECTION?.length || 0) > 0} />
        <HotelMetric label="Released today" value={releasedToday} detail="Inspected and AVAILABLE" />
      </section>

      <HotelSection eyebrow="Room readiness" title="Priority turnover queue" detail="Arrival-blocking rooms come first. Within the queue, clean rooms awaiting inspection are surfaced before cleaning work because QC is the shortest safe path back to guest-ready inventory.">
        {loading ? <HotelEmptyState>Loading housekeeping…</HotelEmptyState> : activeTasks.length ? (
          <div className="divide-y divide-black/[0.055]">
            <div className="hidden grid-cols-[110px_minmax(190px,1fr)_130px_150px_145px] gap-3 bg-[#FCFBF8] px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#969087] md:grid"><span>Room</span><span>Operational priority</span><span>Room state</span><span>Housekeeping</span><span>Next move</span></div>
            {activeTasks.map((task) => {
              const taskStatus = normalizeStatus(task);
              const room = task?.hotel_rooms || {};
              const busy = busyTaskId === task.id;
              return (
                <div key={task.id} className="grid gap-2 px-4 py-3 md:grid-cols-[110px_minmax(190px,1fr)_130px_150px_145px] md:items-center md:gap-3 md:px-5">
                  <div>
                    <div className="text-[10px] font-semibold text-[#403C37]">{roomLabel(task)}</div>
                    <div className="mt-0.5 text-[7px] text-[#9A948B]">{room?.room_type || "Room"}</div>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[8px] font-semibold text-[#5F5952]">{task?.task_type || "Room turnover"}</span>
                      {task?.arrival_waiting ? <HotelStatusPill value="ARRIVAL WAITING" tone="critical" /> : null}
                    </div>
                    <div className="mt-0.5 text-[7px] leading-3 text-[#9A948B]">{stageDetail(task)}</div>
                    {task?.arrival_waiting ? <div className="mt-0.5 text-[7px] font-semibold text-[#8A633C]">Guest due {task.arrival_waiting.check_in_date || "today"} · release or move from Front Desk</div> : null}
                  </div>
                  <HotelStatusPill value={room?.status || "UNKNOWN"} />
                  <HotelStatusPill value={taskStatus} tone={taskStatus === "AWAITING_INSPECTION" ? "attention" : undefined} />
                  <div>
                    {taskStatus === "PENDING" ? <HotelPrimaryAction onClick={() => transition(task.id, "START")} disabled={busy}><Play size={9} />{busy ? "Starting" : "Start cleaning"}</HotelPrimaryAction> : taskStatus === "IN_PROGRESS" ? <HotelPrimaryAction onClick={() => transition(task.id, "COMPLETE")} disabled={busy}><CheckCircle2 size={9} />{busy ? "Updating" : "Mark clean"}</HotelPrimaryAction> : <HotelPrimaryAction onClick={() => transition(task.id, "INSPECT")} disabled={busy}><CheckCircle2 size={9} />{busy ? "Releasing" : "Inspect & release"}</HotelPrimaryAction>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <HotelEmptyState>No active housekeeping tasks. Guest-ready turnover is clear.</HotelEmptyState>}
      </HotelSection>
    </HotelWorkspaceShell>
  );
}
