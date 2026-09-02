"use client";

import { useEffect, useMemo, useState } from "react";
import { BookmarkPlus, LoaderCircle, Star, Trash2 } from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { ANALYTICS_METRICS } from "@/lib/analytics/semantic/AnalyticsMetricCatalog";

function clean(value) {
  return String(value ?? "").trim();
}

export default function AnalyticsPreferencesPanel({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [views, setViews] = useState([]);
  const [follows, setFollows] = useState([]);
  const [metricId, setMetricId] = useState(ANALYTICS_METRICS[0]?.id || "");
  const [viewName, setViewName] = useState("");

  const followedIds = useMemo(
    () => new Set((follows || []).map((row) => row.metric_id)),
    [follows],
  );

  function scopeParams() {
    const params = new URLSearchParams({ organizationId });
    if (entityId) params.set("entityId", entityId);
    if (periodId) params.set("periodId", periodId);
    return params;
  }

  async function load() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/workspace/analytics/preferences?${scopeParams().toString()}`,
        { credentials: "include", cache: "no-store" },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || `Analytics preferences failed (${response.status})`);
      }
      setViews(Array.isArray(json.views) ? json.views : []);
      setFollows(Array.isArray(json.follows) ? json.follows : []);
    } catch (loadError) {
      setError(loadError?.message || "Analytics preferences could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId, entityId, periodId]);

  async function post(payload) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workspace/analytics/preferences", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          entityId: entityId || null,
          periodId: periodId || null,
          ...payload,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || `Analytics preference action failed (${response.status})`);
      }
      await load();
      return json;
    } catch (actionError) {
      setError(actionError?.message || "Analytics preference action failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function toggleFollow() {
    const followed = followedIds.has(metricId);
    await post({
      action: followed ? "unfollow_metric" : "follow_metric",
      metricId,
      favorite: !followed,
      alertsEnabled: true,
    });
  }

  async function saveView() {
    const name = clean(viewName);
    if (!name) {
      setError("Give the analytical view a name first.");
      return;
    }
    const followedMetrics = (follows || []).map((row) => row.metric_id);
    const result = await post({
      action: "save_view",
      name,
      viewType: "METRIC_BOARD",
      definition: {
        metric_ids: followedMetrics.length ? followedMetrics : [metricId],
        period_id: periodId || null,
        semantic_catalog: "analytics-semantic-v1",
      },
      isDefault: false,
      isShared: false,
    });
    if (result) setViewName("");
  }

  return (
    <section className="mx-auto mt-5 max-w-[1750px] rounded-[24px] border border-black/[0.075] bg-white p-5 text-[#1B1A18]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Personal analytics</div>
          <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.02em]">Favorites & saved views</h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-[18px] text-[#817D76]">
            Personalize what you watch without changing the governed metric definition. Favorites, views and alert preferences are user control state only.
          </p>
        </div>
        {loading ? (
          <span className="inline-flex items-center gap-2 text-[11px] text-[#817D76]"><LoaderCircle size={13} className="animate-spin" /> Loading preferences</span>
        ) : null}
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-3 py-2 text-[11px] text-red-800">{error}</div> : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-black/[0.065] bg-[#FAF9F7] p-4">
          <div className="text-[11px] font-medium text-[#3E3A34]">Follow a metric</div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              value={metricId}
              onChange={(event) => setMetricId(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-black/[0.09] bg-white px-3 text-[11px] outline-none focus:border-[#D6A66A]"
            >
              {ANALYTICS_METRICS.map((metric) => (
                <option key={metric.id} value={metric.id}>{metric.label} · {metric.domain}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={toggleFollow}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1F1E1B] px-4 text-[11px] font-medium text-white disabled:opacity-50"
            >
              <Star size={13} fill={followedIds.has(metricId) ? "currentColor" : "none"} />
              {followedIds.has(metricId) ? "Unfollow" : "Follow"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(follows || []).slice(0, 12).map((follow) => {
              const metric = ANALYTICS_METRICS.find((entry) => entry.id === follow.metric_id);
              return (
                <span key={follow.id} className="inline-flex items-center gap-1 rounded-full border border-black/[0.07] bg-white px-2.5 py-1 text-[10px] text-[#6E685F]">
                  <Star size={9} className="text-[#A37849]" fill={follow.favorite ? "currentColor" : "none"} /> {metric?.shortLabel || follow.metric_id}
                </span>
              );
            })}
            {!follows.length && !loading ? <span className="text-[10px] text-[#918B83]">No followed metrics yet.</span> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-black/[0.065] bg-[#FAF9F7] p-4">
          <div className="text-[11px] font-medium text-[#3E3A34]">Save a metric board</div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={viewName}
              onChange={(event) => setViewName(event.target.value)}
              placeholder="e.g. Weekly owner review"
              className="h-10 min-w-0 flex-1 rounded-xl border border-black/[0.09] bg-white px-3 text-[11px] outline-none focus:border-[#D6A66A]"
            />
            <button
              type="button"
              disabled={busy}
              onClick={saveView}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-black/[0.09] bg-white px-4 text-[11px] font-medium text-[#4B4842] disabled:opacity-50"
            >
              <BookmarkPlus size={13} className="text-[#A37849]" /> Save view
            </button>
          </div>
          <div className="mt-3 divide-y divide-black/[0.055]">
            {(views || []).slice(0, 6).map((view) => (
              <div key={view.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium text-[#4A4640]">{view.name}</div>
                  <div className="mt-0.5 text-[9px] uppercase tracking-[0.1em] text-[#9A938B]">{view.view_type}{view.is_shared ? " · Shared" : " · Private"}</div>
                </div>
                {view.staff_account_id ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => post({ action: "delete_view", viewId: view.id })}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9C958C] hover:bg-white hover:text-red-700"
                    aria-label={`Delete ${view.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                ) : null}
              </div>
            ))}
            {!views.length && !loading ? <div className="py-2 text-[10px] text-[#918B83]">No saved analytical views yet.</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
