"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

const TASK_TYPES = [
  "REPAIR",
  "INSPECTION",
  "PREVENTIVE",
  "SAFETY",
];

function statusOf(task) {
  return String(task?.status || "PENDING").toUpperCase();
}

function propertyName(task) {
  return task?.hotel_properties?.name || task?.property_id || "Property";
}

export default function OperationsMaintenancePage() {
  const params = useParams();
  const organizationId = params?.organizationId || "";
  const [properties, setProperties] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    propertyId: "",
    taskType: "REPAIR",
    scheduledAt: "",
    notes: "",
  });

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);

    try {
      const query = `?organizationId=${encodeURIComponent(organizationId)}`;
      const [tasksResponse, propertiesResponse] = await Promise.all([
        fetch(`/api/hotel/maintenance/list${query}`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch(`/api/hotel/properties/list${query}`, {
          cache: "no-store",
          credentials: "include",
        }),
      ]);
      const [tasksResult, propertiesResult] = await Promise.all([
        tasksResponse.json(),
        propertiesResponse.json(),
      ]);

      if (!tasksResponse.ok) {
        throw new Error(tasksResult.error || "Unable to load maintenance tasks");
      }
      if (!propertiesResponse.ok) {
        throw new Error(propertiesResult.error || "Unable to load properties");
      }

      setTasks(tasksResult.tasks || []);
      setProperties(propertiesResult.properties || []);
      setForm((current) => ({
        ...current,
        propertyId: current.propertyId || propertiesResult.properties?.[0]?.id || "",
      }));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createTask() {
    setBusyId("create");
    setError(null);

    try {
      const response = await fetch("/api/hotel/maintenance/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          propertyId: form.propertyId,
          taskType: form.taskType,
          scheduledAt: form.scheduledAt || null,
          notes: form.notes,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to create maintenance task");
      }

      setForm((current) => ({
        ...current,
        notes: "",
      }));
      await load();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusyId(null);
    }
  }

  async function transition(taskId, action) {
    setBusyId(taskId);
    setError(null);

    try {
      const response = await fetch("/api/hotel/maintenance/update", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          taskId,
          action,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to update maintenance task");
      }

      await load();
    } catch (transitionError) {
      setError(transitionError.message);
    } finally {
      setBusyId(null);
    }
  }

  const groups = useMemo(() => ({
    PENDING: tasks.filter((task) => statusOf(task) === "PENDING"),
    IN_PROGRESS: tasks.filter((task) => statusOf(task) === "IN_PROGRESS"),
    COMPLETED: tasks.filter((task) => statusOf(task) === "COMPLETED"),
  }), [tasks]);

  return (
    <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 text-white">
      <header className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-[#D6A66A]">Hotel Operations</p>
        <h1 className="mt-2 text-3xl font-semibold">Maintenance Control</h1>
        <p className="mt-2 text-sm text-white/45">Create, start and complete property maintenance work under one organization-scoped workflow.</p>
      </header>

      {error ? <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-red-100">{error}</div> : null}

      <section className="grid gap-4 rounded-[30px] border border-white/10 bg-white/[0.03] p-5 md:grid-cols-4">
        <select value={form.propertyId} onChange={(event) => setForm((current) => ({ ...current, propertyId: event.target.value }))} className="rounded-xl border border-white/10 bg-black px-3 py-3">
          <option value="">Select property</option>
          {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
        </select>
        <select value={form.taskType} onChange={(event) => setForm((current) => ({ ...current, taskType: event.target.value }))} className="rounded-xl border border-white/10 bg-black px-3 py-3">
          {TASK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} className="rounded-xl border border-white/10 bg-black px-3 py-3" />
        <button disabled={busyId === "create" || !form.propertyId} onClick={createTask} className="rounded-xl bg-[#D6A66A] px-4 py-3 font-semibold text-black disabled:opacity-30">Create Task</button>
        <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Maintenance notes" className="min-h-24 rounded-xl border border-white/10 bg-black px-3 py-3 md:col-span-4" />
      </section>

      {loading ? <div className="text-white/45">Loading maintenance...</div> : (
        <section className="grid gap-5 xl:grid-cols-3">
          {Object.entries(groups).map(([status, rows]) => (
            <div key={status} className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">{status.replace("_", " ")}</h2><span className="text-sm text-white/40">{rows.length}</span></div>
              <div className="space-y-3">
                {rows.map((task) => (
                  <article key={task.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="font-medium">{propertyName(task)}</div>
                    <div className="mt-1 text-xs text-white/40">{task.task_type || "REPAIR"}</div>
                    {task.notes ? <p className="mt-3 text-sm text-white/60">{task.notes}</p> : null}
                    {status === "PENDING" ? <button disabled={busyId === task.id} onClick={() => transition(task.id, "START")} className="mt-4 w-full rounded-xl border border-[#D6A66A]/40 py-2 text-sm text-[#F3D7A2] disabled:opacity-30">Start Work</button> : null}
                    {status === "IN_PROGRESS" ? <button disabled={busyId === task.id} onClick={() => transition(task.id, "COMPLETE")} className="mt-4 w-full rounded-xl bg-[#D6A66A] py-2 text-sm font-semibold text-black disabled:opacity-30">Complete Work</button> : null}
                  </article>
                ))}
                {!rows.length ? <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-white/35">No tasks</div> : null}
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
