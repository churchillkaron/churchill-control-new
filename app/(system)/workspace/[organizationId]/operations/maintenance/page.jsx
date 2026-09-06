"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, Wrench } from "lucide-react";

import HotelArrivalReadinessOwnership from "@/components/workspace/hotel/HotelArrivalReadinessOwnership";
import { HotelEmptyState, HotelError, HotelField, HotelMetric, HotelPrimaryAction, HotelSecondaryAction, HotelSection, HotelStatusPill, HotelWorkspaceShell, hotelInputClass, hotelTextareaClass } from "@/components/workspace/hotel/HotelWorkspaceUI";

const TASK_TYPES = ["REPAIR", "INSPECTION", "PREVENTIVE", "SAFETY"];
const TERMINAL_REQUESTS = new Set(["RESOLVED", "CLOSED", "COMPLETED", "CANCELLED"]);
const statusOf = (task) => String(task?.status || "PENDING").toUpperCase();
const propertyName = (task) => task?.hotel_properties?.name || task?.property_id || "Property";
const roomName = (request) => request?.hotel_rooms?.room_number ? `Room ${request.hotel_rooms.room_number}` : request?.room_id || "Room";

export default function OperationsMaintenancePage() {
  const params = useParams();
  const organizationId = params?.organizationId || "";
  const [properties, setProperties] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [roomRequests, setRoomRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ propertyId: "", taskType: "REPAIR", scheduledAt: "", notes: "" });

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const q = `?organizationId=${encodeURIComponent(organizationId)}`;
      const [taskResponse, propertyResponse, requestResponse] = await Promise.all([
        fetch(`/api/hotel/maintenance/list${q}`, { cache: "no-store", credentials: "include" }),
        fetch(`/api/hotel/properties/list${q}`, { cache: "no-store", credentials: "include" }),
        fetch(`/api/hotel/maintenance/requests${q}`, { cache: "no-store", credentials: "include" }),
      ]);
      const [taskData, propertyData, requestData] = await Promise.all([taskResponse.json(), propertyResponse.json(), requestResponse.json()]);
      if (!taskResponse.ok) throw new Error(taskData.error || "Unable to load maintenance tasks");
      if (!propertyResponse.ok) throw new Error(propertyData.error || "Unable to load properties");
      if (!requestResponse.ok) throw new Error(requestData.error || "Unable to load room defects");
      setTasks(taskData.tasks || []);
      setRoomRequests(requestData.requests || []);
      setProperties(propertyData.properties || []);
      setForm((current) => ({ ...current, propertyId: current.propertyId || propertyData.properties?.[0]?.id || "" }));
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Maintenance");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => ({
    PENDING: tasks.filter((task) => statusOf(task) === "PENDING"),
    IN_PROGRESS: tasks.filter((task) => statusOf(task) === "IN_PROGRESS"),
    COMPLETED: tasks.filter((task) => statusOf(task) === "COMPLETED"),
  }), [tasks]);
  const activeTasks = [...groups.PENDING, ...groups.IN_PROGRESS];
  const activeRoomRequests = useMemo(() => roomRequests.filter((request) => !TERMINAL_REQUESTS.has(statusOf(request))), [roomRequests]);

  async function createTask() {
    setBusyId("create");
    setError(null);
    try {
      const response = await fetch("/api/hotel/maintenance/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, propertyId: form.propertyId, taskType: form.taskType, scheduledAt: form.scheduledAt || null, notes: form.notes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create maintenance task");
      setForm((current) => ({ ...current, notes: "" }));
      await load();
    } catch (createError) {
      setError(createError?.message || "Unable to create maintenance task");
    } finally {
      setBusyId(null);
    }
  }

  async function transitionTask(taskId, action) {
    setBusyId(taskId);
    setError(null);
    try {
      const response = await fetch("/api/hotel/maintenance/update", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, taskId, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update maintenance task");
      await load();
    } catch (transitionError) {
      setError(transitionError?.message || "Unable to update maintenance task");
    } finally {
      setBusyId(null);
    }
  }

  async function transitionRequest(requestId, action) {
    setBusyId(requestId);
    setError(null);
    try {
      const response = await fetch("/api/hotel/maintenance/requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      const data = await response.json();
      if (!response.ok || data.success === false) throw new Error(data.error || "Unable to update room defect");
      await load();
    } catch (transitionError) {
      setError(transitionError?.message || "Unable to update room defect");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="maintenance"
      title="Maintenance"
      subtitle="Room defects that block guest readiness are canonical Maintenance requests. Property/preventive work remains a separate planning queue; completing a planning task never silently clears a room blocker."
      actions={<HotelSecondaryAction onClick={load} disabled={loading}><RefreshCw size={9} className={loading ? "animate-spin" : ""}/>Refresh</HotelSecondaryAction>}
    >
      <HotelError>{error}</HotelError>

      <HotelArrivalReadinessOwnership organizationId={organizationId} focusOwner="MAINTENANCE" compact />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <HotelMetric label="Room defects" value={activeRoomRequests.length} detail="Canonical room blockers" attention={activeRoomRequests.length > 0} />
        <HotelMetric label="Planned pending" value={groups.PENDING.length} detail="Property/preventive work" attention={groups.PENDING.length > 0} />
        <HotelMetric label="Planned in progress" value={groups.IN_PROGRESS.length} detail="Non-room work underway" attention={groups.IN_PROGRESS.length > 0} />
        <HotelMetric label="Planned completed" value={groups.COMPLETED.length} detail="Closed planning tasks" />
      </section>

      <HotelSection eyebrow="Guest readiness" title="Room defects blocking release" detail="This is the authority Housekeeping and Front Desk actually read. Resolve only when the physical defect is genuinely cleared; room availability is still decided by the remaining room and Housekeeping state.">
        {loading ? <HotelEmptyState>Loading room defects…</HotelEmptyState> : activeRoomRequests.length ? (
          <div className="divide-y divide-black/[0.055]">
            {activeRoomRequests.map((request) => {
              const busy = busyId === request.id;
              const status = statusOf(request);
              return (
                <div key={request.id} className="grid gap-2 px-4 py-3 md:grid-cols-[110px_minmax(220px,1fr)_110px_120px_150px] md:items-center md:px-5">
                  <div>
                    <div className="text-[10px] font-semibold text-[#403C37]">{roomName(request)}</div>
                    <div className="mt-0.5 text-[7px] text-[#9A948B]">{request.hotel_rooms?.room_type || "Room"} · {request.hotel_rooms?.status || "state unknown"}</div>
                  </div>
                  <div>
                    <div className="text-[8px] font-semibold text-[#5F5952]">{request.issue_title || "Room defect"}</div>
                    <div className="mt-0.5 text-[7px] leading-3 text-[#928B82]">{request.issue_description || "No description recorded"}</div>
                  </div>
                  <HotelStatusPill value={request.priority || "UNKNOWN"} tone={["CRITICAL", "URGENT", "HIGH"].includes(String(request.priority || "").toUpperCase()) ? "critical" : undefined} />
                  <HotelStatusPill value={status} tone={status === "IN_PROGRESS" ? "attention" : undefined} />
                  <div className="flex flex-wrap gap-1.5">
                    {status !== "IN_PROGRESS" ? <HotelSecondaryAction onClick={() => transitionRequest(request.id, "START")} disabled={busy}>Start work</HotelSecondaryAction> : null}
                    <HotelPrimaryAction onClick={() => transitionRequest(request.id, "RESOLVE")} disabled={busy}><Wrench size={9} />{busy ? "Updating" : "Resolve defect"}</HotelPrimaryAction>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <HotelEmptyState>No unresolved room defects are blocking guest readiness.</HotelEmptyState>}
      </HotelSection>

      <HotelSection eyebrow="Planned maintenance" title="New property maintenance task" detail="Use this for preventive, inspection, safety and general property work. It is intentionally separate from canonical room-readiness defects.">
        <div className="grid gap-3 p-4 md:grid-cols-4">
          <HotelField label="Property"><select className={hotelInputClass} value={form.propertyId} onChange={(event) => setForm((current) => ({ ...current, propertyId: event.target.value }))}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></HotelField>
          <HotelField label="Task type"><select className={hotelInputClass} value={form.taskType} onChange={(event) => setForm((current) => ({ ...current, taskType: event.target.value }))}>{TASK_TYPES.map((type) => <option key={type}>{type}</option>)}</select></HotelField>
          <HotelField label="Scheduled"><input type="datetime-local" className={hotelInputClass} value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))}/></HotelField>
          <div className="flex items-end"><HotelPrimaryAction onClick={createTask} disabled={busyId === "create" || !form.propertyId}>Create task</HotelPrimaryAction></div>
          <div className="md:col-span-4"><HotelField label="Notes"><textarea className={hotelTextareaClass} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}/></HotelField></div>
        </div>
      </HotelSection>

      <HotelSection eyebrow="Property work" title="Planned maintenance queue" detail="These tasks support property operations but do not clear canonical room defects unless the room-defect record itself is resolved.">
        {loading ? <HotelEmptyState>Loading planned maintenance…</HotelEmptyState> : activeTasks.length ? (
          <div className="divide-y divide-black/[0.055]">
            {activeTasks.map((task) => (
              <div key={task.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(160px,1fr)_130px_130px_minmax(180px,1.2fr)_120px] md:items-center md:px-5">
                <div className="text-[9px] font-semibold text-[#403C37]">{propertyName(task)}</div>
                <div className="text-[8px] text-[#716B63]">{task.task_type || "REPAIR"}</div>
                <HotelStatusPill value={statusOf(task)}/>
                <div className="truncate text-[8px] text-[#807A72]">{task.notes || "No notes"}</div>
                <div>{statusOf(task) === "PENDING" ? <HotelSecondaryAction onClick={() => transitionTask(task.id, "START")} disabled={busyId === task.id}>Start work</HotelSecondaryAction> : <HotelPrimaryAction onClick={() => transitionTask(task.id, "COMPLETE")} disabled={busyId === task.id}>Complete</HotelPrimaryAction>}</div>
              </div>
            ))}
          </div>
        ) : <HotelEmptyState>No active planned maintenance work.</HotelEmptyState>}
      </HotelSection>
    </HotelWorkspaceShell>
  );
}
