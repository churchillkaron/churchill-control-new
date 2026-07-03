"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, RefreshCw } from "lucide-react";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import MetricCard from "@/components/workspace/MetricCard";

import {
  getWorkspaceGroups,
} from "@/lib/platform/registry/erpRegistry";

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

        {error && (
          <div className="mb-5 rounded-3xl border border-red-400/25 bg-red-500/10 p-5 text-sm text-red-200">
            {error}
          </div>
        )}

        {resolvedMetrics.length > 0 && (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {resolvedMetrics.map(metric => (
              <MetricCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
              />
            ))}
          </section>
        )}

        {resolvedAttention.length > 0 && (
          <section className="mt-5 rounded-[30px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.055] p-6 shadow-2xl shadow-black/20">
            <div className="mb-4 text-xs uppercase tracking-[0.30em] text-[#D6A66A]">
              Attention Required
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {resolvedAttention.map(item => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4 text-sm"
                >
                  <span className="text-white/65">
                    {item.label}
                  </span>

                  <span className="text-white">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-5 rounded-[30px] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/20">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.30em] text-white/35">
                Work Centers
              </div>

              <h2 className="mt-2 text-2xl font-light text-white">
                {group?.name || "Modules"}
              </h2>
            </div>

            <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/35">
              {items.length}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map(item => (
              <Link
                key={item.id}
                href={resolveWorkspaceRoute({
                  organizationId,
                  moduleId: item.id,
                  route: item.route,
                })}
                className="group rounded-2xl border border-white/10 bg-black/20 p-5 transition hover:border-[#D6A66A]/40 hover:bg-[#D6A66A]/10"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white">
                      {item.name}
                    </div>

                    <div className="mt-2 text-sm leading-6 text-white/42">
                      {item.description || "Open this work center."}
                    </div>
                  </div>

                  <ArrowRight
                    size={17}
                    className="mt-1 text-white/25 transition group-hover:translate-x-1 group-hover:text-[#D6A66A]"
                  />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
