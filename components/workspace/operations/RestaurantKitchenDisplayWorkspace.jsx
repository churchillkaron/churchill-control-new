"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Check, ChefHat, Clock3, Flame, RefreshCw } from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const CLOSED = new Set(["COMPLETED", "CANCELLED", "VOID", "SERVED"]);

function normalized(value) {
  return String(value || "").trim().toUpperCase();
}

function ageMinutes(value) {
  const created = new Date(value || 0).getTime();
  if (!created) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 60000));
}

function ageLabel(value) {
  const minutes = ageMinutes(value);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function ticketTone(createdAt) {
  const minutes = ageMinutes(createdAt);
  if (minutes >= 20) {
    return {
      border: "border-red-400/35",
      background: "bg-red-500/[0.055]",
      age: "text-red-200",
      label: "Late",
    };
  }
  if (minutes >= 10) {
    return {
      border: "border-amber-300/30",
      background: "bg-amber-300/[0.045]",
      age: "text-amber-100",
      label: "Watch",
    };
  }
  return {
    border: "border-white/10",
    background: "bg-white/[0.025]",
    age: "text-white/45",
    label: "On time",
  };
}

function ticketTitle(entry) {
  return (
    entry.context?.label ||
    entry.context?.reference ||
    entry.demand?.reference ||
    "Unassigned table"
  );
}

function workCenterName(entry) {
  return entry.work_center?.name || entry.queue_name || "Kitchen";
}

function itemStatus(item) {
  const status = normalized(item?.status || "NEW");
  if (["IN_PROGRESS", "PREPARING"].includes(status)) return "PREPARING";
  if (status === "READY") return "READY";
  return status;
}

function TicketItem({ entry, item, busy, onUpdate }) {
  const status = itemStatus(item);
  const itemId = item.id || item.source_id;
  const canStart = !["PREPARING", "READY", "SERVED", "COMPLETED", "CANCELLED", "VOID"].includes(status);
  const canReady = !["READY", "SERVED", "COMPLETED", "CANCELLED", "VOID"].includes(status);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold leading-5">
            {Number(item.quantity || 1)} × {item.name || "Item"}
          </div>
          {item.notes ? (
            <div className="mt-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.055] px-3 py-2 text-xs font-medium leading-4 text-amber-100/85">
              {item.notes}
            </div>
          ) : null}
          {item.modifiers && typeof item.modifiers === "object" ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(item.modifiers)
                .filter(([key, value]) => value && !["notes", "seat"].includes(key))
                .map(([key, value]) => (
                  <span key={key} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-white/48">
                    {String(value)}
                  </span>
                ))}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45">
          {status}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || !canStart}
          onClick={() => onUpdate(entry, item, "PREPARING")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] text-xs font-semibold text-white/65 disabled:opacity-25"
        >
          <Flame size={14} /> Start
        </button>
        <button
          type="button"
          disabled={busy || !canReady}
          onClick={() => onUpdate(entry, item, "READY")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#D6A66A] text-xs font-bold text-black disabled:opacity-25"
        >
          <Check size={14} /> Ready
        </button>
      </div>
    </div>
  );
}

export default function RestaurantKitchenDisplayWorkspace() {
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
  const [view, setView] = useState("ACTIVE");
  const [station, setStation] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    if (!entityId) {
      setEntries([]);
      setLoading(false);
      setError("Select a legal entity before opening the kitchen display.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/operations/fulfillment?scope=all&organizationId=${encodeURIComponent(organizationId)}&entityId=${encodeURIComponent(entityId)}`,
        { cache: "no-store", credentials: "include" },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load kitchen tickets");
      }

      const restaurantEntries = (result.entries || []).filter(
        (entry) => String(entry.source?.type || "").toLowerCase() === "restaurant_kitchen_ticket",
      );
      setEntries(restaurantEntries);
      setApplicationId(result.application_id || null);
    } catch (loadError) {
      setEntries([]);
      setError(loadError.message || "Unable to load kitchen tickets");
    } finally {
      setLoading(false);
    }
  }, [entityId, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = window.setInterval(load, 15000);
    return () => window.clearInterval(interval);
  }, [load]);

  const stations = useMemo(
    () => [
      "ALL",
      ...new Set(entries.map((entry) => workCenterName(entry)).filter(Boolean)),
    ],
    [entries],
  );

  const activeEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const entryStatus = normalized(entry.status);
        const items = entry.work_items || [];
        const hasOpenItem = items.some((item) => !CLOSED.has(itemStatus(item)));
        if (CLOSED.has(entryStatus) && !hasOpenItem) return false;
        if (station !== "ALL" && workCenterName(entry) !== station) return false;
        if (view === "READY") {
          return items.some((item) => itemStatus(item) === "READY");
        }
        if (view === "PREPARING") {
          return items.some((item) => itemStatus(item) === "PREPARING");
        }
        return true;
      }),
    [entries, station, view],
  );

  const metrics = useMemo(() => {
    const openItems = entries.flatMap((entry) => entry.work_items || []).filter((item) => !CLOSED.has(itemStatus(item)));
    return {
      tickets: entries.filter((entry) => !CLOSED.has(normalized(entry.status))).length,
      preparing: openItems.filter((item) => itemStatus(item) === "PREPARING").length,
      ready: openItems.filter((item) => itemStatus(item) === "READY").length,
      late: entries.filter((entry) => ageMinutes(entry.created_at) >= 20 && !CLOSED.has(normalized(entry.status))).length,
    };
  }, [entries]);

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
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to update kitchen item");
      }
      await load();
    } catch (actionError) {
      setError(actionError.message || "Unable to update kitchen item");
    } finally {
      setActionId(null);
    }
  }

  return (
    <main className="min-h-screen bg-black px-3 py-4 text-white lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1900px]">
        <header className="rounded-[28px] border border-white/10 bg-white/[0.025] p-4 lg:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">
                <ChefHat size={14} /> Kitchen Display
              </div>
              <h1 className="mt-2 text-3xl font-light tracking-tight">Cook what matters now.</h1>
              <p className="mt-1 text-xs text-white/38">
                Live restaurant tickets only. No payment, customer or back-office controls on the kitchen screen.
              </p>
            </div>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-white/55"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              ["Tickets", metrics.tickets],
              ["Cooking", metrics.preparing],
              ["Ready", metrics.ready],
              ["Late", metrics.late],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5">
                <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</div>
                <div className="mt-1 text-2xl font-light">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {["ACTIVE", "PREPARING", "READY"].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={
                  view === value
                    ? "rounded-xl bg-[#D6A66A] px-4 py-2 text-[10px] font-bold text-black"
                    : "rounded-xl border border-white/10 px-4 py-2 text-[10px] font-semibold text-white/48"
                }
              >
                {value}
              </button>
            ))}
          </div>

          {stations.length > 2 ? (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {stations.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStation(value)}
                  className={
                    station === value
                      ? "shrink-0 rounded-xl bg-white px-3 py-2 text-[10px] font-semibold text-black"
                      : "shrink-0 rounded-xl border border-white/10 px-3 py-2 text-[10px] text-white/42"
                  }
                >
                  {value}
                </button>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              {error}
            </div>
          ) : null}
        </header>

        <section className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {loading ? (
            <div className="col-span-full flex min-h-72 items-center justify-center rounded-[26px] border border-white/10 text-sm text-white/30">
              Loading kitchen tickets...
            </div>
          ) : activeEntries.length ? (
            activeEntries.map((entry) => {
              const tone = ticketTone(entry.created_at);
              const activeItems = (entry.work_items || []).filter((item) => !CLOSED.has(itemStatus(item)));
              return (
                <article key={entry.id} className={`rounded-[26px] border ${tone.border} ${tone.background} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#D6A66A]">
                        {workCenterName(entry)}
                      </div>
                      <h2 className="mt-1 text-2xl font-semibold tracking-tight">{ticketTitle(entry)}</h2>
                      <div className="mt-1 text-[10px] text-white/30">{entry.demand?.reference || entry.id}</div>
                    </div>
                    <div className={`flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold ${tone.age}`}>
                      <Clock3 size={12} /> {ageLabel(entry.created_at)}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-y border-white/10 py-2 text-[10px] text-white/35">
                    <span>{activeItems.length} active item{activeItems.length === 1 ? "" : "s"}</span>
                    <span>{tone.label}</span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {activeItems.length ? (
                      activeItems.map((item) => {
                        const itemId = item.id || item.source_id;
                        return (
                          <TicketItem
                            key={itemId || item.name}
                            entry={entry}
                            item={item}
                            busy={actionId === `${entry.id}:${itemId}`}
                            onUpdate={updateItem}
                          />
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 px-3 py-7 text-center text-xs text-white/28">
                        No active prep items.
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="col-span-full flex min-h-72 items-center justify-center rounded-[26px] border border-dashed border-white/10 text-sm text-white/30">
              No kitchen tickets in this view.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
