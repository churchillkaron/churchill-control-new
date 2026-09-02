"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, RefreshCw } from "lucide-react";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import MetricCard from "@/components/workspace/MetricCard";

import {
  getWorkspaceGroups,
} from "@/lib/platform/registry/erpRegistry.base.js";

import {
  resolveWorkspaceRoute,
} from "@/lib/platform/routing/resolveWorkspaceRoute";

export default function WorkspaceHub({
  workspaceId,
  groupId,
  eyebrow = "Workspace",
  title,
  description,
  runtimeEndpoint,
  runtimeMethod = "POST",
  metrics = [],
  attention = [],
}) {
  const params = useParams();
  const organizationId = params?.organizationId;
  const [runtime, setRuntime] = useState({});
  const [loading, setLoading] = useState(Boolean(runtimeEndpoint));
  const [error, setError] = useState("");

  const group = useMemo(() => {
    return getWorkspaceGroups(workspaceId)
      .find(item => item.id === groupId) || null;
  }, [workspaceId, groupId]);

  const items = group?.items || [];

  async function loadRuntime() {
    if (!runtimeEndpoint || !organizationId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const options = runtimeMethod === "POST"
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ organizationId }),
          }
        : { cache: "no-store" };

      const res = await fetch(runtimeEndpoint, options);
      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(json.error || "Runtime load failed");
      }

      setRuntime(json || {});
    } catch (err) {
      setError(err.message);
      setRuntime({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRuntime();
  }, [organizationId, runtimeEndpoint]);

  const resolvedMetrics = metrics.map(metric => ({
    ...metric,
    value: loading
      ? "..."
      : metric.value
        ? metric.value(runtime)
        : runtime?.[metric.key] ?? 0,
  }));

  const resolvedAttention = attention.map(item => ({
    ...item,
    value: loading
      ? "..."
      : item.value
        ? item.value(runtime)
        : runtime?.[item.key] ?? 0,
  }));

  return (
    <main className="min-h-screen py-1 text-[#191919]">
      <div className="mx-auto max-w-[1540px]">
        <WorkspaceHeader
          workspace={eyebrow}
          title={title || group?.name || "Workspace"}
          description={description || group?.description || ""}
          actions={
            runtimeEndpoint ? (
              <button
                onClick={loadRuntime}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-black/[0.08] bg-[#FBFAF8] px-4 text-[12px] font-medium text-[#5F5B55] transition hover:border-[#D6A66A]/40 hover:bg-white hover:text-[#8D643C]"
              >
                <RefreshCw size={14} />
                Refresh
              </button>
            ) : null
          }
        />

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-[12px] text-red-700">
            {error}
          </div>
        ) : null}

        {resolvedMetrics.length ? (
          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {resolvedMetrics.map(metric => (
              <MetricCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                subtitle={metric.subtitle}
              />
            ))}
          </section>
        ) : null}

        {resolvedAttention.length ? (
          <section className="mt-6 rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_8px_26px_rgba(31,27,20,0.04)]">
            <div className="mb-4 text-[10px] font-medium uppercase tracking-[0.18em] text-[#8A867F]">
              Attention
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {resolvedAttention.map(item => (
                <div
                  key={item.key}
                  className="rounded-2xl border border-black/[0.07] bg-[#F7F6F3] p-4"
                >
                  <div className="text-[11px] text-[#8D8982]">{item.label}</div>
                  <div className="mt-2 text-2xl font-medium tracking-[-0.03em] text-[#1D1C1A]">{item.value}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map(item => {
            const href = resolveWorkspaceRoute({
              organizationId,
              moduleId: workspaceId,
              route: item.route,
            });

            return (
              <Link
                key={item.id}
                href={href}
                className="group rounded-[22px] border border-black/[0.075] bg-white p-5 shadow-[0_6px_20px_rgba(31,27,20,0.035)] transition hover:-translate-y-0.5 hover:border-[#D6A66A]/40 hover:bg-[#FBF8F3]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[15px] font-semibold tracking-[-0.015em] text-[#292723]">{item.name}</div>
                    <div className="mt-2 text-[12px] leading-6 text-[#79756E]">{item.description}</div>
                  </div>
                  <ArrowRight
                    size={16}
                    className="mt-1 shrink-0 text-[#B7B3AB] transition group-hover:translate-x-0.5 group-hover:text-[#A37849]"
                  />
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}