"use client";

export const dynamic = "force-dynamic";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import PageWrapper from "@/components/PageWrapper";

const STATUS_ORDER = Object.freeze([
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
]);

function normalizeStatus(task) {
  return String(
    task?.task_status || "PENDING"
  ).toUpperCase();
}

function statusLabel(status) {
  if (status === "IN_PROGRESS") return "In progress";
  if (status === "COMPLETED") return "Completed";
  return "Pending";
}

function statusClass(status) {
  if (status === "COMPLETED") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }

  if (status === "IN_PROGRESS") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  }

  return "border-white/10 bg-white/[0.04] text-white/55";
}

function roomLabel(task) {
  const room = task?.hotel_rooms;

  return (
    room?.room_number ||
    room?.name ||
    task?.room_id ||
    "Unassigned room"
  );
}

function TaskCard({
  task,
  busy,
  onTransition,
}) {
  const status = normalizeStatus(task);
  const room = task?.hotel_rooms || {};

  return (
    <article className="rounded-[26px] border border-white/10 bg-black/25 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]">
            {task?.task_type || "Housekeeping"}
          </p>
          <h3 className="mt-2 text-2xl font-semibold">
            Room {roomLabel(task)}
          </h3>
          <p className="mt-1 text-sm text-white/40">
            {room?.room_type || "Room service task"}
          </p>
        </div>

        <span className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusClass(status)}`}>
          {statusLabel(status)}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
          <div className="text-xs text-white/35">Room state</div>
          <div className="mt-1 font-medium">
            {room?.status || "Unknown"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
          <div className="text-xs text-white/35">Scheduled</div>
          <div className="mt-1 font-medium">
            {task?.scheduled_at
              ? new Date(task.scheduled_at).toLocaleString()
              : "Not scheduled"}
          </div>
        </div>
      </div>

      {status === "PENDING" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onTransition(task.id, "START")}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] py-3.5 text-sm font-semibold text-black disabled:opacity-35"
        >
          {busy ? <LoaderCircle size={17} className="animate-spin" /> : <Play size={17} />}
          Start Cleaning
        </button>
      ) : null}

      {status === "IN_PROGRESS" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onTransition(task.id, "COMPLETE")}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 py-3.5 text-sm font-semibold text-black disabled:opacity-35"
        >
          {busy ? <LoaderCircle size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
          Complete and Release Room
        </button>
      ) : null}
    </article>
  );
}

export default function OperationsHousekeepingPage() {
  const params = useParams();
  const router = useRouter();
  const organizationId = params?.organizationId || null;

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [error, setError] = useState(null);

  const loadTasks = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;

    if (silent) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const response = await fetch(
        `/api/hotel/housekeeping/list?organizationId=${encodeURIComponent(organizationId)}`,
        {
          cache: "no-store",
          credentials: "include",
        }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          "Unable to load housekeeping tasks"
        );
      }

      setTasks(result.tasks || []);
    } catch (loadError) {
      setError(
        loadError?.message ||
        "Unable to load housekeeping tasks"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const groupedTasks = useMemo(() => {
    return Object.fromEntries(
      STATUS_ORDER.map((status) => [
        status,
        tasks.filter(
          (task) => normalizeStatus(task) === status
        ),
      ])
    );
  }, [tasks]);

  async function transition(taskId, action) {
    if (!organizationId || !taskId) return;

    setBusyTaskId(taskId);
    setError(null);

    try {
      const response = await fetch(
        "/api/hotel/housekeeping/update",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId,
            taskId,
            action,
          }),
        }
      );
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(
          result.error ||
          "Housekeeping transition failed"
        );
      }

      await loadTasks({ silent: true });
    } catch (transitionError) {
      setError(
        transitionError?.message ||
        "Housekeeping transition failed"
      );
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <PageWrapper
      title="Housekeeping"
      subtitle="Turn checked-out rooms back into available inventory"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-xs text-white/55">
            Pending {groupedTasks.PENDING?.length || 0}
          </div>
          <div className="rounded-xl border border-amber-400/15 bg-amber-400/5 px-4 py-2 text-xs text-amber-100">
            In progress {groupedTasks.IN_PROGRESS?.length || 0}
          </div>
          <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 px-4 py-2 text-xs text-emerald-200">
            Completed {groupedTasks.COMPLETED?.length || 0}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push(`/workspace/${organizationId}/operations/front-desk`)}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60"
          >
            Front Desk
          </button>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => loadTasks({ silent: true })}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 disabled:opacity-35"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-[30px] border border-white/10 bg-white/[0.025] text-white/40">
          <LoaderCircle className="mr-2 animate-spin" size={18} />
          Loading housekeeping tasks...
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          {STATUS_ORDER.map((status) => {
            const statusTasks = groupedTasks[status] || [];
            const Icon =
              status === "COMPLETED"
                ? CheckCircle2
                : status === "IN_PROGRESS"
                  ? Sparkles
                  : Clock3;

            return (
              <section
                key={status}
                className="rounded-[30px] border border-white/10 bg-white/[0.025] p-5"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon size={18} className="text-[#D6A66A]" />
                    <h2 className="font-semibold">
                      {statusLabel(status)}
                    </h2>
                  </div>
                  <span className="text-sm text-white/35">
                    {statusTasks.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {statusTasks.length ? (
                    statusTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        busy={busyTaskId === task.id}
                        onTransition={transition}
                      />
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/30">
                      No {statusLabel(status).toLowerCase()} tasks.
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageWrapper>
  );
}
