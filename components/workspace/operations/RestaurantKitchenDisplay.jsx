"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ChefHat, Clock3, RefreshCw } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const CLOSED = new Set(["COMPLETED", "CANCELLED", "VOID", "SERVED"]);
const READY = new Set(["READY"]);
const COOKING = new Set(["IN_PROGRESS", "PREPARING"]);

function statusOf(value) {
  return String(value || "NEW").trim().toUpperCase();
}

function sourceTypeOf(value) {
  return String(value || "").trim().toLowerCase();
}

function ageMinutes(createdAt) {
  const created = new Date(createdAt || 0).getTime();
  if (!created) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 60000));
}

function ticketLabel(entry) {
  return (
    entry.context?.label ||
    entry.context?.reference ||
    entry.demand?.reference ||
    "Table"
  );
}

function ageClass(minutes) {
  if (minutes >= 20) return "border-red-400/45 bg-red-500/[0.07] text-red-100";
  if (minutes >= 12) return "border-amber-300/35 bg-amber-300/[0.06] text-amber-100";
  return "border-white/10 bg-white/[0.025] text-white";
}

export default function RestaurantKitchenDisplay() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;

  const [entries, setEntries] = useState([]);
  const [applicationId, setApplicationId] = useState(null);
  const [filter, setFilter] = useState("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const loadQueue = useCallback(async ({ quiet = false } = {}) => {
    if (!organizationId) return;
    if (!entityId) {
      setEntries([]);
      setLoading(false);
      setError("Select a legal entity before opening the kitchen display.");
      return;
    }

    if (!quiet) setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/operations/fulfillment?scope=all&organizationId=${encodeURIComponent(organizationId)}&entityId=${encodeURIComponent(entityId)}`,
        { cache: "no-store", credentials: "include" },
      );
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load kitchen tickets");
      }

      setEntries(
        (result.entries || []).filter(
          (entry) => sourceTypeOf(entry.source?.type) === "restaurant_kitchen_ticket",
        ),
      );
      setApplicationId(result.application_id || null);
      setLastSync(new Date());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [entityId, organizationId]);

  useEffect(() => {
    loadQueue();
    const timer = window.setInterval(() => loadQueue({ quiet: true }), 8000);
    return () => window.clearInterval(timer);
  }, [loadQueue]);

  const activeTickets = useMemo(
    () => entries.filter((entry) => !CLOSED.has(statusOf(entry.status))),
    [entries],
  );

  const visibleTickets = useMemo(() => {
    const source = filter === "ALL" ? entries : activeTickets;
    const filtered = filter === "READY"
      ? source.filter(
          (entry) =>
            READY.has(statusOf(entry.status)) ||
            (entry.work_items || []).some((item) => READY.has(statusOf(item.status))),
        )
      : filter === "COOKING"
        ? source.filter((entry) =>
            (entry.work_items || []).some((item) => COOKING.has(statusOf(item.status))),
          )
        : source;

    return [...filtered].sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
    );
  }, [activeTickets, entries, filter]);

  const metrics = useMemo(() => ({
    active: activeTickets.length,
    cooking: activeTickets.filter((entry) =>
      (entry.work_items || []).some((item) => COOKING.has(statusOf(item.status))),
    ).length,
    ready: activeTickets.filter((entry) =>
      READY.has(statusOf(entry.status)) ||
      (entry.work_items || []).some((item) => READY.has(statusOf(item.status))),
    ).length,
    late: activeTickets.filter((entry) => ageMinutes(entry.created_at) >= 20).length,
  }), [activeTickets]);

  async function updateItem(entry, item, status) {
    const itemId = item.id || item.source_id;
    if (!itemId || !entityId) return;

    setActionId(`${entry.id}:${itemId}`);
    setError(null);

    try {
      const response = await fetch("/api/operations/fulfillment", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          entityId,
          applicationId,
          queueEntryId: entry.id,
          workItemId: itemId,
          sourceType: entry.source?.type || null,
          status,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to update kitchen item");
      }
      await loadQueue({ quiet: true });
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionId(null);
    }
  }

  return (
    <main className="min-h-screen bg-black px-3 py-4 text-white lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1900px]">
        <header className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4 lg:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.07] p-2.5 text-[#D6A66A]">
                <ChefHat size={20} />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">Kitchen Display</div>
                <h1 className="mt-1 text-2xl font-light tracking-tight lg:text-3xl">Cook what is next. Mark it ready.</h1>
                <p className="mt-1 text-xs text-white/35">No payment, floor administration or serving controls in the kitchen station.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => loadQueue()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-white/50"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              ["Active", metrics.active],
              ["Cooking", metrics.cooking],
              ["Ready", metrics.ready],
              ["20m+", metrics.late],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5">
                <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</div>
                <div className="mt-0.5 text-xl font-light">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {["ACTIVE", "COOKING", "READY", "ALL"].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={
                  filter === value
                    ? "rounded-xl bg-[#D6A66A] px-3 py-2 text-[10px] font-bold text-black"
                    : "rounded-xl border border-white/10 px-3 py-2 text-[10px] text-white/45"
                }
              >
                {value}
              </button>
            ))}
            <div className="ml-auto text-[10px] text-white/25">
              {lastSync ? `Synced ${lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Connecting"}
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{error}</div>
          ) : null}
        </header>

        <section className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {loading ? (
            <div className="col-span-full flex min-h-[420px] items-center justify-center rounded-[26px] border border-white/10 text-sm text-white/30">
              Loading kitchen tickets...
            </div>
          ) : visibleTickets.length ? (
            visibleTickets.map((entry) => {
              const minutes = ageMinutes(entry.created_at);
              return (
                <article key={entry.id} className={`rounded-[24px] border p-4 ${ageClass(minutes)}`}>
                  <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.18em] opacity-50">{entry.work_center?.name || "Kitchen"}</div>
                      <h2 className="mt-1 text-2xl font-semibold">{ticketLabel(entry)}</h2>
                      <div className="mt-1 text-[10px] opacity-35">{entry.demand?.reference || entry.demand?.id || entry.id}</div>
                    </div>
                    <div className="flex items-center gap-1 rounded-full border border-current/15 px-2.5 py-1 text-xs font-semibold opacity-70">
                      <Clock3 size={12} /> {minutes}m
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {(entry.work_items || []).map((item) => {
                      const itemId = item.id || item.source_id;
                      const status = statusOf(item.status);
                      const busy = actionId === `${entry.id}:${itemId}`;
                      const ready = READY.has(status);
                      const closed = CLOSED.has(status);
                      return (
                        <div key={itemId || item.name} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-base font-semibold">{Number(item.quantity || 1)} × {item.name || "Item"}</div>
                              {item.notes ? <div className="mt-1 text-xs font-medium text-amber-100/80">{item.notes}</div> : null}
                            </div>
                            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] opacity-40">{status}</div>
                          </div>

                          {!closed ? (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                disabled={busy || COOKING.has(status) || ready}
                                onClick={() => updateItem(entry, item, "PREPARING")}
                                className="rounded-xl border border-white/15 py-2.5 text-xs font-semibold disabled:opacity-25"
                              >
                                {COOKING.has(status) ? "Cooking" : "Start"}
                              </button>
                              <button
                                type="button"
                                disabled={busy || ready}
                                onClick={() => updateItem(entry, item, "READY")}
                                className="rounded-xl bg-[#D6A66A] py-2.5 text-xs font-bold text-black disabled:opacity-30"
                              >
                                {busy ? "Saving..." : ready ? "Ready" : "Ready"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="col-span-full flex min-h-[420px] items-center justify-center rounded-[26px] border border-dashed border-white/10 text-sm text-white/30">
              No kitchen tickets in this view.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
