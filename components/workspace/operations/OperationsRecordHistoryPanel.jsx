"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-GB");
}

function titleCase(value) {
  return String(value || "")
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function actorLabel(item) {
  return item?.actor?.name || item?.actor?.email || item?.actor_id || "System";
}

export default function OperationsRecordHistoryPanel({
  capabilityId,
  recordId,
  organizationId,
  entityId = null,
  periodId = null,
  refreshKey = 0,
}) {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    if (!organizationId || !capabilityId || !recordId) {
      setTimeline([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ organization_id: organizationId });
      if (entityId) params.set("entity_id", entityId);
      if (periodId) params.set("period_id", periodId);

      const response = await fetch(
        `/api/operations/${capabilityId}/${recordId}/history?${params.toString()}`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Operations record history could not be loaded.");
      }

      setTimeline(Array.isArray(json.timeline) ? json.timeline : []);
    } catch (loadError) {
      setTimeline([]);
      setError(loadError.message || "Operations record history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, entityId, periodId, capabilityId, recordId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/30">Record history</div>
          <div className="mt-1 text-xs text-white/35">
            {loading ? "Loading…" : `${timeline.length} audit entries`}
          </div>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={load}
          className="rounded-xl border border-white/10 p-2 text-white/45 disabled:opacity-40"
          aria-label="Refresh record history"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {timeline.map((item) => {
          const isExpanded = expanded === item.id;
          const detail = item.type === "command"
            ? { payload: item.payload, result: item.result, error: item.error }
            : item.payload;

          return (
            <button
              type="button"
              key={item.id}
              onClick={() => setExpanded(isExpanded ? null : item.id)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.025] p-3 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white/80">
                    {titleCase(item.command || item.event_type || item.type)}
                  </div>
                  <div className="mt-1 text-[11px] text-white/35">
                    {actorLabel(item)} · {formatDate(item.occurred_at)}
                  </div>
                </div>
                <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-white/35">
                  {item.status || item.type}
                </span>
              </div>

              {isExpanded ? (
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap border-t border-white/10 pt-3 text-[10px] leading-4 text-white/50">
                  {JSON.stringify(detail || {}, null, 2)}
                </pre>
              ) : null}
            </button>
          );
        })}

        {!loading && !error && timeline.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-white/35">
            No command or event history is available for this record yet.
          </div>
        ) : null}
      </div>
    </section>
  );
}
