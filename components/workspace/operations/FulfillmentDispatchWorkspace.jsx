"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Clock3, RefreshCw } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const CLOSED_STATUSES = new Set(["COMPLETED", "SERVED", "CANCELLED", "VOID"]);

function statusOf(value) {
  return String(value || "").trim().toUpperCase();
}

function elapsed(createdAt) {
  const created = new Date(createdAt || 0).getTime();
  if (!created) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - created) / 60000));
  return `${minutes}m`;
}

function entryTitle(entry, fallback) {
  return (
    entry.context?.label ||
    entry.context?.reference ||
    entry.demand?.reference ||
    fallback
  );
}

export default function FulfillmentDispatchWorkspace({
  eyebrow = "Commerce Execution",
  title = "Fulfillment Dispatch",
  description = "Live fulfillment work routed through operational queues and work centres.",
  emptyLabel = "No fulfillment work in this view.",
  contextFallback = "Unassigned context",
} = {}) {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;

  const [entries, setEntries] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [applicationId, setApplicationId] = useState(null);
  const [filter, setFilter] = useState("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState(null);

  const loadQueue = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/operations/fulfillment?scope=all&organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store", credentials: "include" }
      );
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load fulfillment queue");
      }

      setEntries(result.entries || []);
      setMetrics(result.metrics || null);
      setApplicationId(result.application_id || null);
    } catch (loadError) {
      setEntries([]);
      setMetrics(null);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const visibleEntries = useMemo(() => {
    if (filter === "ALL") return entries;
    if (filter === "READY") {
      return entries.filter(
        (entry) =>
          statusOf(entry.status) === "READY" ||
          (entry.work_items || []).some(
            (item) => statusOf(item.status) === "READY"
          )
      );
    }

    return entries.filter(
      (entry) => !CLOSED_STATUSES.has(statusOf(entry.status))
    );
  }, [entries, filter]);

  async function updateItem(entry, item, status) {
    const itemId = item.id || item.source_id;
    if (!itemId) return;

    setActionId(`${entry.id}:${itemId}`);
    setError(null);

    try {
      const response = await fetch("/api/operations/fulfillment", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          applicationId,
          queueEntryId: entry.id,
          workItemId: itemId,
          status,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to update fulfillment item");
      }
      await loadQueue();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#080808] px-6 py-8 text-white">
      <div className="mx-auto max-w-[1700px]">
        <header className="rounded-[34px] border border-white/10 bg-white/[0.035] p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
                {eyebrow}
              </p>
              <h1 className="mt-3 text-4xl font-semibold">{title}</h1>
              <p className="mt-2 text-sm text-white/45">{description}</p>
            </div>
            <button
              onClick={loadQueue}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60"
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {["ACTIVE", "READY", "ALL"].map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={
                  filter === value
                    ? "rounded-xl bg-[#D6A66A] px-4 py-2 text-xs font-semibold text-black"
                    : "rounded-xl border border-white/10 px-4 py-2 text-xs text-white/50"
                }
              >
                {value}
              </button>
            ))}

            {metrics ? (
              <div className="ml-auto flex flex-wrap gap-2 text-xs text-white/40">
                <span className="rounded-xl border border-white/10 px-3 py-2">
                  Active {metrics.active ?? 0}
                </span>
                <span className="rounded-xl border border-white/10 px-3 py-2">
                  Ready {metrics.ready ?? 0}
                </span>
                <span className="rounded-xl border border-white/10 px-3 py-2">
                  Total {metrics.total ?? entries.length}
                </span>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </header>

        <section className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {loading ? (
            <div className="col-span-full rounded-3xl border border-white/10 p-10 text-center text-white/35">
              Loading fulfillment queue...
            </div>
          ) : visibleEntries.length ? (
            visibleEntries.map((entry) => (
              <article
                key={entry.id}
                className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-[#D6A66A]">
                      {entry.work_center?.name || entry.queue_name || "Work centre"}
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold">
                      {entryTitle(entry, contextFallback)}
                    </h2>
                    <div className="mt-1 text-xs text-white/35">
                      {entry.demand?.reference || entry.demand?.id || entry.id}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/45">
                    <Clock3 size={13} /> {elapsed(entry.created_at)}
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {(entry.work_items || []).length ? (
                    entry.work_items.map((item) => {
                      const itemId = item.id || item.source_id;
                      const status = statusOf(item.status || "NEW");
                      const busy = actionId === `${entry.id}:${itemId}`;

                      return (
                        <div
                          key={itemId || item.name}
                          className="rounded-2xl border border-white/10 bg-black/25 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">
                                {Number(item.quantity || 1)} × {item.name || "Item"}
                              </div>
                              {item.notes ? (
                                <div className="mt-1 text-xs text-orange-200/70">
                                  {item.notes}
                                </div>
                              ) : null}
                            </div>
                            <div className="text-xs text-white/40">{status}</div>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                              disabled={
                                busy ||
                                ["PREPARING", "READY", "SERVED", "COMPLETED"].includes(status)
                              }
                              onClick={() => updateItem(entry, item, "PREPARING")}
                              className="rounded-xl border border-white/10 py-2 text-xs text-white/60 disabled:opacity-30"
                            >
                              Start
                            </button>
                            <button
                              disabled={
                                busy || ["READY", "SERVED", "COMPLETED"].includes(status)
                              }
                              onClick={() => updateItem(entry, item, "READY")}
                              className="rounded-xl bg-[#D6A66A] py-2 text-xs font-semibold text-black disabled:opacity-30"
                            >
                              Ready
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-white/10 p-4 text-sm text-white/35">
                      Queue entry has no persisted work items.
                    </div>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="col-span-full rounded-3xl border border-dashed border-white/10 p-12 text-center text-white/35">
              {emptyLabel}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
