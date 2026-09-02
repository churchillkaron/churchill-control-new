"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
} from "lucide-react";

function metric(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function scopedHref(organizationId, href) {
  if (!href) return `/workspace/${organizationId}/creative/studio`;
  if (href.startsWith(`/workspace/${organizationId}`)) return href;
  return `/workspace/${organizationId}${href.startsWith("/") ? href : `/${href}`}`;
}

export default function CreativeAgencyWorkQueue({ organizationId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ organizationId });
        const response = await fetch(`/api/workspace/creative/command-center?${params.toString()}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Unable to load Creative work");
        }
        setData(payload);
      } catch (loadError) {
        if (loadError?.name === "AbortError") return;
        setError(loadError?.message || "Unable to load Creative work");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [organizationId, refreshKey]);

  const metrics = data?.metrics || {};
  const queue = Array.isArray(data?.queue) ? data.queue : [];
  const cards = useMemo(() => [
    { label: "Active projects", value: metric(metrics.active_projects), detail: "Creative work in motion" },
    { label: "Production failures", value: metric(metrics.production_failed), detail: "Needs repair", warning: metric(metrics.production_failed) > 0 },
    { label: "Review required", value: metric(metrics.review_required), detail: "Needs a decision", warning: metric(metrics.review_required) > 0 },
    { label: "Ready to publish", value: metric(metrics.approved_not_published), detail: "Approved, not released", warning: metric(metrics.approved_not_published) > 0 },
  ], [metrics]);

  return (
    <section className="mt-8 rounded-[26px] border border-white/[0.075] bg-white/[0.018]">
      <div className="flex flex-col gap-4 border-b border-white/[0.06] px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#D6A66A]/60">My Creative Work</div>
          <h2 className="mt-2 text-2xl font-medium tracking-[-0.03em] text-white/88">What needs attention now</h2>
          <p className="mt-2 text-[11px] leading-5 text-white/30">One queue across automatic Creative Studio and every specialist engine.</p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
          className="inline-flex h-9 items-center gap-2 self-start rounded-lg border border-white/[0.08] px-3 text-[9px] font-medium uppercase tracking-[0.16em] text-white/36 transition hover:border-[#D6A66A]/25 hover:text-[#D6A66A]/80 disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-white/[0.06] bg-white/[0.055] lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-[#070706] p-4 sm:p-5">
            <div className="text-[9px] uppercase tracking-[0.16em] text-white/25">{card.label}</div>
            <div className={`mt-2 text-2xl font-light tabular-nums ${card.warning ? "text-[#E2B77F]" : "text-white/78"}`}>{card.value}</div>
            <div className="mt-1 text-[9px] text-white/22">{card.detail}</div>
          </div>
        ))}
      </div>

      <div className="px-5 py-3 sm:px-6">
        {loading && !data ? (
          <div className="flex items-center gap-2 py-7 text-[11px] text-white/28">
            <Clock3 className="h-4 w-4 animate-pulse" /> Loading creative work…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 py-7 text-[11px] text-[#D6A66A]/70">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        ) : queue.length === 0 ? (
          <div className="flex items-center gap-2 py-7 text-[11px] text-white/34">
            <CheckCircle2 className="h-4 w-4 text-[#7B8C72]" /> No creative handoff needs attention right now.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.055]">
            {queue.slice(0, 10).map((item) => (
              <Link
                key={item.id}
                href={scopedHref(organizationId, item.href)}
                className="group grid gap-2 py-3.5 sm:grid-cols-[100px_minmax(0,1fr)_130px_20px] sm:items-center"
              >
                <div className={`text-[8px] font-semibold uppercase tracking-[0.16em] ${item.priority === "attention" ? "text-[#D6A66A]/78" : "text-white/28"}`}>
                  {item.kind || "Work"}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium text-white/72">{item.title}</div>
                  <div className="mt-1 truncate text-[9px] text-white/25">{item.detail}</div>
                </div>
                <div className="text-[9px] text-white/28 sm:text-right">{item.status}</div>
                <ArrowRight className="hidden h-3 w-3 text-white/16 transition group-hover:translate-x-0.5 group-hover:text-[#D6A66A]/70 sm:block" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
