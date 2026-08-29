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

  const organizationId =
    params?.organizationId;

  const [runtime, setRuntime] =
    useState({});

  const [loading, setLoading] =
    useState(Boolean(runtimeEndpoint));

  const [error, setError] =
    useState("");

  const group =
    useMemo(() => {
      return getWorkspaceGroups(workspaceId)
        .find(item => item.id === groupId) || null;
    }, [
      workspaceId,
      groupId,
    ]);

  const items =
    group?.items || [];

  async function loadRuntime() {
    if (!runtimeEndpoint || !organizationId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const options =
        runtimeMethod === "POST"
          ? {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                organizationId,
              }),
            }
          : {
              cache: "no-store",
            };

      const res =
        await fetch(runtimeEndpoint, options);

      const json =
        await res.json();

      if (json.success === false) {
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
  }, [
    organizationId,
    runtimeEndpoint,
  ]);

  const resolvedMetrics =
    metrics.map(metric => ({
      ...metric,
      value:
        loading
          ? "..."
          : metric.value
            ? metric.value(runtime)
            : runtime?.[metric.key] ?? 0,
    }));

  const resolvedAttention =
    attention.map(item => ({
      ...item,
      value:
        loading
          ? "..."
          : item.value
            ? item.value(runtime)
            : runtime?.[item.key] ?? 0,
    }));

  return (
    <main className="min-h-screen px-6 py-7 text-white">
      <div className="mx-auto max-w-[1540px]">
        <WorkspaceHeader
          workspace={eyebrow}
          title={title || group?.name || "Workspace"}
          description={description || group?.description || ""}
          actions={
            runtimeEndpoint ? (
              <button
                onClick={loadRuntime}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white/65 transition hover:border-[#D6A66A]/35 hover:bg-[#D6A66A]/10 hover:text-white"
              >
                <RefreshCw size={15} />
                Refresh
              </button>
            ) : null
          }
        />

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {resolvedMetrics.length ? (
          <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {resolvedMetrics.map(metric => (
              <MetricCard
                key={metric.key}
                title={metric.label}
                value={metric.value}
                subtitle={metric.subtitle}
              />
            ))}
          </section>
        ) : null}

        {resolvedAttention.length ? (
          <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.025] p-5">
            <div className="mb-4 text-xs uppercase tracking-[0.2em] text-white/35">
              Attention
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {resolvedAttention.map(item => (
                <div
                  key={item.key}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4"
                >
                  <div className="text-xs text-white/40">{item.label}</div>
                  <div className="mt-2 text-2xl font-light text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                className="group rounded-3xl border border-white/10 bg-white/[0.025] p-5 transition hover:border-[#D6A66A]/35 hover:bg-[#D6A66A]/[0.06]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-light text-white">{item.name}</div>
                    <div className="mt-2 text-sm leading-6 text-white/45">{item.description}</div>
                  </div>
                  <ArrowRight
                    size={17}
                    className="mt-1 shrink-0 text-white/25 transition group-hover:translate-x-1 group-hover:text-[#D6A66A]"
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
