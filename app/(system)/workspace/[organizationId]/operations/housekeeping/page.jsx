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

const STATUS_ORDER = Object.freeze(["PENDING", "IN_PROGRESS", "COMPLETED"]);

function normalizeStatus(task) {
  return String(task?.task_status || "PENDING").toUpperCase();
}

function roomLabel(task) {
  const room = task?.hotel_rooms;
  return room?.room_number || room?.name || task?.room_id || "Unassigned room";
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

  const activeTasks = [...(groupedTasks.PENDING || []), ...(groupedTasks.IN_PROGRESS || [])];

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="housekeeping"
      title="Housekeeping"
      subtitle="Turn room turnover into ready inventory with a visible handoff from pending work to cleaning to released room."
      actions={<>
        <HotelPrimaryAction href={hotelWorkspaceHref(organizationId, "front-desk")}>Front Desk</HotelPrimaryAction>
        <HotelSecondaryAction onClick={() => loadTasks({ silent: true })} disabled={refreshing}><RefreshCw size={9} className={refreshing ? "animate-spin" : ""} />Refresh</HotelSecondaryAction>
      </>}
    >
      <HotelError>{error}</HotelError>

      <section className="grid grid-cols-3 gap-3">
        <HotelMetric label="Pending" value={groupedTasks.PENDING?.length || 0} detail="Waiting to be started" attention={(groupedTasks.PENDING?.length || 0) > 0} />
        <HotelMetric label="In progress" value={groupedTasks.IN_PROGRESS?.length || 0} detail="Rooms being turned" attention={(groupedTasks.IN_PROGRESS?.length || 0) > 0} />
        <HotelMetric label="Completed" value={groupedTasks.COMPLETED?.length || 0} detail="Released tasks" />
      </section>

      <HotelSection eyebrow="Room turnover" title="Active housekeeping work" detail="Pending rooms first, then work already in progress. Completion is the room-release handoff.">
        {loading ? <HotelEmptyState>Loading housekeeping…</HotelEmptyState> : activeTasks.length ? (
          <div className="divide-y divide-black/[0.055]">
            <div className="hidden grid-cols-[120px_minmax(160px,1fr)_140px_140px_130px] gap-3 bg-[#FCFBF8] px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#969087] md:grid"><span>Room</span><span>Task</span><span>Room state</span><span>Status</span><span>Next move</span></div>
            {activeTasks.map((task) => {
              const taskStatus = normalizeStatus(task);
              const room = task?.hotel_rooms || {};
              const busy = busyTaskId === task.id;
              return (
                <div key={task.id} className="grid gap-2 px-4 py-3 md:grid-cols-[120px_minmax(160px,1fr)_140px_140px_130px] md:items-center md:gap-3 md:px-5">
                  <div className="text-[10px] font-semibold text-[#403C37]">{roomLabel(task)}</div>
                  <div><div className="text-[8px] font-semibold text-[#5F5952]">{task?.task_type || "Room turnover"}</div><div className="mt-0.5 text-[7px] text-[#9A948B]">{task?.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "No scheduled time"}</div></div>
                  <HotelStatusPill value={room?.status || "UNKNOWN"} />
                  <HotelStatusPill value={taskStatus} />
                  <div>{taskStatus === "PENDING" ? <HotelPrimaryAction onClick={() => transition(task.id, "START")} disabled={busy}><Play size={9} />{busy ? "Starting" : "Start"}</HotelPrimaryAction> : <HotelPrimaryAction onClick={() => transition(task.id, "COMPLETE")} disabled={busy}><CheckCircle2 size={9} />{busy ? "Releasing" : "Complete"}</HotelPrimaryAction>}</div>
                </div>
              );
            })}
          </div>
        ) : <HotelEmptyState>No active housekeeping tasks. Room turnover is clear.</HotelEmptyState>}
      </HotelSection>
    </HotelWorkspaceShell>
  );
}
