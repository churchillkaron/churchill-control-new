"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { BellRing, Check, Clock3, RefreshCw } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const READY = "READY";
const RESTAURANT_SOURCES = new Set([
  "restaurant_kitchen_ticket",
  "restaurant_bar_ticket",
]);

function statusOf(value) {
  return String(value || "").trim().toUpperCase();
}

function sourceTypeOf(value) {
  return String(value || "").trim().toLowerCase();
}

function tableLabel(entry) {
  return entry.context?.label || entry.context?.reference || "Table";
}

function stationLabel(entry) {
  return entry.work_center?.name || entry.queue_name || "Pass";
}

function readyAgeMinutes(entry, item) {
  const raw =
    item?.raw?.ready_at ||
    item?.ready_at ||
    entry?.ready_at ||
    entry?.raw?.ready_at ||
    entry?.created_at ||
    null;
  const value = new Date(raw || 0).getTime();
  if (!value) return 0;
  return Math.max(0, Math.floor((Date.now() - value) / 60000));
}

function ageClass(minutes) {
  if (minutes >= 10) return "border-red-400/45 bg-red-500/[0.08]";
  if (minutes >= 5) return "border-amber-300/35 bg-amber-300/[0.06]";
  return "border-white/10 bg-white/[0.025]";
}

export default function RestaurantExpoPass() {
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
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!organizationId) return;
    if (!entityId) {
      setEntries([]);
      setLoading(false);
      setError("Select a legal entity before opening the restaurant pass.");
      return;
    }

    if (!quiet) setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({
        organizationId: String(organizationId),
        entityId: String(entityId),
        scope: "ready",
      });
      const response = await fetch(`/api/operations/fulfillment?${query.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load ready items");
      }

      setApplicationId(result.application_id || null);
      setEntries(
        (result.entries || []).filter((entry) =>
          RESTAURANT_SOURCES.has(sourceTypeOf(entry.source?.type)),
        ),
      );
      setLastSync(new Date());
    } catch (loadError) {
      setError(loadError?.message || "Unable to load restaurant pass");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [entityId, organizationId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load({ quiet: true }), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const readyItems = useMemo(() => {
    const result = [];
    entries.forEach((entry) => {
      (entry.work_items || []).forEach((item) => {
        if (statusOf(item.status) !== READY) return;
        result.push({
          entry,
          item,
          age: readyAgeMinutes(entry, item),
        });
      });
    });
    return result.sort((a, b) => b.age - a.age);
  }, [entries]);

  const tableCount = useMemo(
    () => new Set(readyItems.map(({ entry }) => entry.context?.id || entry.context?.reference)).size,
    [readyItems],
  );
  const overdue = readyItems.filter(({ age }) => age >= 10).length;

  async function markServed(entry, item) {
    const itemId = item.id || item.source_id;
    if (!itemId || !entry?.id || !entityId) return;

    setBusyId(`${entry.id}:${itemId}`);
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
          status: "SERVED",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to complete handoff");
      }
      await load({ quiet: true });
    } catch (actionError) {
      setError(actionError?.message || "Unable to complete handoff");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-black px-3 py-4 text-white lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1900px]">
        <header className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4 lg:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.07] p-2.5 text-[#D6A66A]">
                <BellRing size={20} />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">Restaurant Pass</div>
                <h1 className="mt-1 text-2xl font-light tracking-tight lg:text-3xl">Ready now. Handoff fast.</h1>
                <p className="mt-1 text-xs text-white/35">Only ready kitchen and bar items appear here. Expo confirms the physical handoff; Kitchen never marks food served.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => load()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-white/50"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              ["Ready", readyItems.length],
              ["Tables", tableCount],
              ["10m+", overdue],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5">
                <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</div>
                <div className="mt-0.5 text-xl font-light">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 text-[10px] text-white/25">
            {lastSync ? `Synced ${lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Connecting"}
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{error}</div>
          ) : null}
        </header>

        <section className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {loading ? (
            <div className="col-span-full flex min-h-[420px] items-center justify-center rounded-[26px] border border-white/10 text-sm text-white/30">
              Loading ready items...
            </div>
          ) : readyItems.length ? (
            readyItems.map(({ entry, item, age }) => {
              const itemId = item.id || item.source_id;
              const busy = busyId === `${entry.id}:${itemId}`;
              const seat = item.attributes?.seat_position || item.raw?.seat_position || null;
              return (
                <article key={`${entry.id}:${itemId}`} className={`rounded-[24px] border p-4 ${ageClass(age)}`}>
                  <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.18em] text-[#D6A66A]">{stationLabel(entry)}</div>
                      <h2 className="mt-1 text-2xl font-semibold">{tableLabel(entry)}</h2>
                      <div className="mt-1 text-[10px] text-white/35">{seat ? `Seat ${seat}` : "Table handoff"}</div>
                    </div>
                    <div className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-white/60">
                      <Clock3 size={12} /> {age}m
                    </div>
                  </div>

                  <div className="py-4">
                    <div className="text-xl font-semibold">{Number(item.quantity || 1)} × {item.name || "Item"}</div>
                    {item.notes ? <div className="mt-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-xs text-amber-100/85">{item.notes}</div> : null}
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => markServed(entry, item)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A66A] px-4 py-4 text-sm font-bold text-black disabled:opacity-40"
                  >
                    <Check size={17} /> {busy ? "Handing off..." : "Served"}
                  </button>
                </article>
              );
            })
          ) : (
            <div className="col-span-full flex min-h-[420px] flex-col items-center justify-center rounded-[26px] border border-dashed border-white/10 text-center">
              <Check size={24} className="text-[#D6A66A]" />
              <div className="mt-3 text-sm font-medium">Pass is clear</div>
              <div className="mt-1 text-xs text-white/30">Ready items appear automatically.</div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
