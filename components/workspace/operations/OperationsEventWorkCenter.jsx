"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function clean(value) {
  return value === undefined || value === null ? "" : String(value);
}

function eventLabel(event) {
  return event?.event_type || event?.command || event?.id || "Operations event";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-GB");
}

function buildContextParams({ organizationId, entityId, periodId }) {
  const params = new URLSearchParams({ organization_id: organizationId });
  if (entityId) params.set("entity_id", entityId);
  if (periodId) params.set("period_id", periodId);
  return params;
}

export default function OperationsEventWorkCenter({ capability }) {
  const businessContext = useBusinessContext() || {};
  const organizationId = businessContext.organization_id || businessContext.organization?.id || null;
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;

  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [health, setHealth] = useState({});
  const [deadLetters, setDeadLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = buildContextParams({ organizationId, entityId, periodId });
      params.set("limit", "300");

      const [eventsResponse, healthResponse] = await Promise.all([
        fetch(`/api/operations/events?${params.toString()}`, { cache: "no-store" }),
        fetch(`/api/operations/events/health?${params.toString()}`, { cache: "no-store" }),
      ]);

      const eventsJson = await eventsResponse.json().catch(() => ({}));
      const healthJson = await healthResponse.json().catch(() => ({}));

      if (!eventsResponse.ok || !eventsJson.ok) {
        throw new Error(eventsJson.error || "Operations event history could not be loaded.");
      }

      if (!healthResponse.ok || !healthJson.ok) {
        throw new Error(healthJson.error || "Operations event health could not be loaded.");
      }

      const nextEvents = Array.isArray(eventsJson.events) ? eventsJson.events : [];
      setEvents(nextEvents);
      setHealth(healthJson.health || {});
      setDeadLetters(Array.isArray(healthJson.dead_letters) ? healthJson.dead_letters : []);
      setSelectedId((current) => (
        current && nextEvents.some((event) => event.id === current)
          ? current
          : nextEvents[0]?.id || null
      ));
    } catch (loadError) {
      setError(loadError.message || "Operations event history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, entityId, periodId]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return events;

    return events.filter((event) => [
      event.event_type,
      event.capability_id,
      event.command,
      event.aggregate_type,
      event.aggregate_id,
      event.actor_id,
      JSON.stringify(event.payload || {}),
    ].filter(Boolean).join(" ").toLowerCase().includes(normalized));
  }, [events, query]);

  const selected = filteredEvents.find((event) => event.id === selectedId)
    || filteredEvents[0]
    || null;

  async function flushPending() {
    if (!organizationId) return;
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/operations/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          entity_id: entityId || null,
          period_id: periodId || null,
          limit: 200,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Operations event delivery failed.");
      }

      setNotice(`Published ${Number(json.published || 0)} pending events.`);
      await load();
    } catch (flushError) {
      setError(flushError.message || "Operations event delivery failed.");
    } finally {
      setSaving(false);
    }
  }

  async function retryDeadLetter(outboxId) {
    if (!organizationId || !outboxId) return;
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/operations/events/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          entity_id: entityId || null,
          period_id: periodId || null,
          outbox_id: outboxId,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Operations event retry failed.");
      }

      setNotice("Dead-letter event requeued and delivery attempted.");
      await load();
    } catch (retryError) {
      setError(retryError.message || "Operations event retry failed.");
    } finally {
      setSaving(false);
    }
  }

  function exportEvents() {
    const blob = new Blob([JSON.stringify(filteredEvents, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${capability?.capabilityId || "operations-events"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen px-6 py-7 text-white">
      <div className="mx-auto max-w-[1540px]">
        <WorkspaceHeader
          workspace="Operations"
          title={capability?.name || "Operations Event History"}
          description={capability?.description || "Immutable Operations event history and delivery health."}
          actions={(
            <div className="flex flex-wrap gap-2">
              <button onClick={exportEvents} className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/65">
                Export
              </button>
              <button disabled={saving} onClick={flushPending} className="rounded-xl border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-4 py-2 text-sm text-[#D6A66A] disabled:opacity-50">
                Flush Events
              </button>
              <button disabled={loading} onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/65 disabled:opacity-50">
                <RefreshCw size={15} /> Refresh
              </button>
            </div>
          )}
        />

        {error ? <div className="mb-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
        {notice ? <div className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div> : null}

        <section className="mb-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Published", health.published],
            ["Pending", health.pending],
            ["Retry", health.retry],
            ["Processing", health.processing],
            ["Dead Letter", health.dead_letter],
            ["Max Attempts", health.max_attempts],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/30">{label}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{Number(value || 0)}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,0.75fr)]">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">Immutable events</div>
                <div className="mt-2 text-sm text-white/40">{loading ? "Loading…" : `${filteredEvents.length} events`}</div>
              </div>
              <div className="flex w-full items-center rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white/45 md:w-[360px]">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search event history…" className="ml-3 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
              </div>
            </div>

            <div className="space-y-2">
              {filteredEvents.map((event) => (
                <button key={event.id} onClick={() => setSelectedId(event.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selected?.id === event.id ? "border-[#D6A66A]/40 bg-[#D6A66A]/10" : "border-white/10 bg-black/20 hover:border-white/20"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-white">{eventLabel(event)}</div>
                      <div className="mt-1 text-xs text-white/35">{event.capability_id || event.aggregate_type || "operations"} · {formatDate(event.occurred_at)}</div>
                    </div>
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/40">{event.command || "event"}</span>
                  </div>
                </button>
              ))}
              {!loading && filteredEvents.length === 0 ? <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/40">No published Operations events in this scope.</div> : null}
            </div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5">
              <div className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">Event detail</div>
              {selected ? (
                <div className="mt-5 space-y-4">
                  <div className="text-xl font-semibold text-white">{eventLabel(selected)}</div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ["Capability", selected.capability_id],
                      ["Command", selected.command],
                      ["Aggregate", selected.aggregate_type],
                      ["Aggregate ID", selected.aggregate_id],
                      ["Actor", selected.actor_id],
                      ["Occurred", formatDate(selected.occurred_at)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <dt className="text-[10px] uppercase tracking-[0.16em] text-white/30">{label}</dt>
                        <dd className="mt-1 break-all text-white/70">{clean(value) || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">Payload</div>
                    <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap text-xs leading-5 text-white/60">{JSON.stringify(selected.payload || {}, null, 2)}</pre>
                  </div>
                </div>
              ) : <div className="mt-5 text-sm text-white/40">Select an event to inspect it.</div>}
            </div>

            {deadLetters.length ? (
              <div className="rounded-[30px] border border-red-400/20 bg-red-500/[0.06] p-5">
                <div className="text-xs uppercase tracking-[0.28em] text-red-200">Dead-letter events</div>
                <div className="mt-4 space-y-3">
                  {deadLetters.map((event) => (
                    <div key={event.id} className="rounded-2xl border border-red-400/15 bg-black/20 p-4">
                      <div className="text-sm font-semibold text-white">{event.event_type}</div>
                      <div className="mt-1 text-xs text-white/35">Attempts: {event.attempts} · {formatDate(event.occurred_at)}</div>
                      <div className="mt-2 text-xs text-red-100/70">{event.last_error?.message || "Delivery failed"}</div>
                      <button disabled={saving} onClick={() => retryDeadLetter(event.id)} className="mt-3 rounded-xl border border-red-300/25 bg-red-500/10 px-3 py-2 text-xs text-red-100 disabled:opacity-50">Retry Delivery</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  );
}
