"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Sparkles,
  UserRound,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function text(value) {
  return String(value ?? "").trim();
}

function titleCase(value) {
  return text(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function hrefFor(organizationId, route) {
  if (!route) return null;
  if (route.startsWith("/workspace/")) return route;
  return `/workspace/${encodeURIComponent(organizationId)}${route.startsWith("/") ? route : `/${route}`}`;
}

function capabilityCount(source, capabilityIds = []) {
  return capabilityIds.reduce(
    (sum, capabilityId) => sum + Number(source?.[capabilityId]?.active || 0),
    0,
  );
}

function StatusPill({ value }) {
  const normalized = text(value).toLowerCase();
  const className =
    normalized.includes("progress") || normalized.includes("active") || normalized.includes("dispatch")
      ? "border-[#7A8C69]/20 bg-[#7A8C69]/[0.08] text-[#5F7052]"
      : normalized.includes("hold") || normalized.includes("blocked") || normalized.includes("incident")
        ? "border-[#B36B52]/20 bg-[#B36B52]/[0.08] text-[#9A533D]"
        : "border-black/[0.08] bg-[#F7F6F3] text-[#747069]";

  return (
    <span className={`rounded-full border px-2 py-1 text-[9px] font-medium uppercase tracking-[0.12em] ${className}`}>
      {titleCase(value || "Open")}
    </span>
  );
}

function MetricCard({ label, value, detail, attention = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8E8A82]">
        {label}
      </div>
      <div className={`mt-3 text-[27px] font-medium tracking-[-0.04em] ${attention && Number(value) > 0 ? "text-[#9A533D]" : "text-[#1A1917]"}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] leading-5 text-[#9A968E]">
        {detail}
      </div>
    </div>
  );
}

export default function OperationsIndustryCommandCenter({
  profile,
  organizationId: organizationIdProp,
  organizationName,
  children,
}) {
  const businessContext = useBusinessContext() || {};
  const organizationId = text(
    organizationIdProp || businessContext.organization_id || businessContext.organization?.id,
  );
  const entityId = text(businessContext.entity_id || businessContext.entity?.id);
  const periodId = text(businessContext.period_id || businessContext.period?.id);
  const entityName =
    businessContext.entity?.display_name ||
    businessContext.entity?.legal_name ||
    businessContext.entity?.name ||
    "All entities";
  const periodName =
    businessContext.period?.name ||
    businessContext.period?.period_name ||
    businessContext.period?.label ||
    null;

  const capabilityIds = useMemo(
    () => [...new Set((profile?.capabilityIds || []).filter(Boolean))],
    [profile?.capabilityIds],
  );

  const [state, setState] = useState({
    loading: true,
    error: null,
    data: null,
  });

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;

    if (!silent) {
      setState((current) => ({ ...current, loading: true, error: null }));
    }

    try {
      const query = new URLSearchParams({
        organization_id: organizationId,
        capabilities: capabilityIds.join(","),
      });
      if (entityId) query.set("entity_id", entityId);
      if (periodId) query.set("period_id", periodId);

      const response = await fetch(`/api/operations/command-center?${query.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load live Operations state");
      }

      setState({ loading: false, error: null, data: result });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Unable to load live Operations state",
      }));
    }
  }, [capabilityIds, entityId, organizationId, periodId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => load({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const metrics = state.data?.metrics || {};
  const capabilityState = state.data?.capabilities || {};
  const attention = Array.isArray(state.data?.attention) ? state.data.attention : [];
  const stages = Array.isArray(profile?.stages) ? profile.stages : [];
  const primaryActions = Array.isArray(profile?.primaryActions) ? profile.primaryActions : [];
  const tools = Array.isArray(profile?.tools) ? profile.tools : [];

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-6 text-[#191919] md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1640px]">
        <header className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-4xl">
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#A37849]">
                {profile?.eyebrow || "Operations"}
              </div>
              <h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em] text-[#1B1A18] md:text-[36px]">
                {profile?.title || organizationName || "Operations Control"}
              </h1>
              <p className="mt-2.5 max-w-3xl text-[13px] leading-6 text-[#6F6B64]">
                {profile?.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#77736C]">
              <span className="rounded-full border border-black/[0.08] bg-[#FBFAF8] px-3 py-1.5">
                {organizationName || businessContext.organization?.name || "Organization"}
              </span>
              <span className="rounded-full border border-black/[0.08] bg-[#FBFAF8] px-3 py-1.5">
                {entityName}
              </span>
              {periodName ? (
                <span className="rounded-full border border-black/[0.08] bg-[#FBFAF8] px-3 py-1.5">
                  {periodName}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => load()}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 transition hover:border-[#D6A66A]/45 hover:text-[#8D6338]"
              >
                <RefreshCw size={11} className={state.loading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>

          {primaryActions.length ? (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-black/[0.07] pt-5">
              {primaryActions.map((action, index) => {
                const href = hrefFor(organizationId, action.route);
                if (!href) return null;
                return (
                  <Link
                    key={action.id || action.label}
                    href={href}
                    className={index === 0
                      ? "inline-flex items-center gap-2 rounded-xl bg-[#1D1B18] px-4 py-2.5 text-[12px] font-medium text-white transition hover:bg-black"
                      : "inline-flex items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-4 py-2.5 text-[12px] font-medium text-[#4E4A44] transition hover:border-[#D6A66A]/45 hover:text-[#8D6338]"}
                  >
                    {action.label}
                    <ArrowRight size={13} />
                  </Link>
                );
              })}
            </div>
          ) : null}
        </header>

        {state.error ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#B36B52]/20 bg-[#B36B52]/[0.06] px-4 py-3 text-[12px] text-[#8B4937]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Live Operations data could not be loaded.</div>
              <div className="mt-1 opacity-80">{state.error}</div>
            </div>
          </div>
        ) : null}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Active work" value={state.loading ? "…" : Number(metrics.active || 0)} detail="Open work in this operating context" />
          <MetricCard label="Due today" value={state.loading ? "…" : Number(metrics.due_today || 0)} detail="Items requiring action today" />
          <MetricCard label="Overdue" value={state.loading ? "…" : Number(metrics.overdue || 0)} detail="Open work past its due time" attention />
          <MetricCard label="Unassigned" value={state.loading ? "…" : Number(metrics.unassigned || 0)} detail="Work without accountable ownership" attention />
          <MetricCard label="Priority" value={state.loading ? "…" : Number(metrics.high_priority || 0)} detail="High or critical active work" attention />
          <MetricCard label="Completed today" value={state.loading ? "…" : Number(metrics.completed_today || 0)} detail="Work completed in the current day" />
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(390px,0.85fr)]">
          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex items-end justify-between gap-4 border-b border-black/[0.07] pb-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">
                  Needs attention
                </div>
                <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1C1B19]">
                  Work to move now
                </h2>
              </div>
              <div className="text-[10px] text-[#AAA69E]">
                Live · permission filtered
              </div>
            </div>

            <div className="divide-y divide-black/[0.06]">
              {!state.loading && attention.length === 0 ? (
                <div className="flex items-center gap-3 py-8 text-[12px] text-[#77736C]">
                  <CheckCircle2 size={16} className="text-[#718167]" />
                  Nothing currently requires attention in this operating context.
                </div>
              ) : null}

              {attention.slice(0, 10).map((item) => {
                const href = hrefFor(organizationId, `/operations/${item.capability_id}`);
                return (
                  <Link
                    key={item.id}
                    href={href}
                    className="group grid gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-[13px] font-medium text-[#292723] group-hover:text-[#8D6338]">
                          {item.name || item.code || titleCase(item.capability_id)}
                        </div>
                        <StatusPill value={item.status} />
                        {item.overdue ? (
                          <span className="rounded-full border border-[#B36B52]/20 bg-[#B36B52]/[0.07] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-[#9A533D]">
                            Overdue
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#9A968E]">
                        <span>{titleCase(item.capability_id)}</span>
                        {item.priority ? <span>{titleCase(item.priority)} priority</span> : null}
                        {item.due_at ? <span>Due {new Date(item.due_at).toLocaleString()}</span> : null}
                        {!item.assigned_to ? <span className="inline-flex items-center gap-1"><UserRound size={10} /> Unassigned</span> : null}
                      </div>
                    </div>
                    <ArrowRight size={13} className="hidden text-[#B7B3AB] transition group-hover:translate-x-0.5 group-hover:text-[#B2814E] sm:block" />
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="border-b border-black/[0.07] pb-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">
                Live workflow
              </div>
              <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1C1B19]">
                Operating flow
              </h2>
            </div>

            <div className="mt-2 divide-y divide-black/[0.06]">
              {stages.map((stage, index) => {
                const count = capabilityCount(capabilityState, stage.capabilityIds);
                const href = hrefFor(organizationId, stage.route);
                const content = (
                  <div className="flex items-center gap-3 py-3.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/[0.08] bg-[#FBFAF8] text-[11px] font-medium text-[#77736C]">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[12px] font-medium text-[#35322E]">{stage.label}</div>
                        <div className="text-[16px] font-medium text-[#1F1D1A]">{state.loading ? "…" : count}</div>
                      </div>
                      {stage.description ? (
                        <div className="mt-0.5 text-[10px] leading-4 text-[#9A968E]">{stage.description}</div>
                      ) : null}
                    </div>
                    {href ? <ArrowRight size={12} className="text-[#C0BCB4]" /> : null}
                  </div>
                );

                return href ? (
                  <Link key={stage.id || stage.label} href={href} className="block hover:bg-[#FBFAF8]">
                    {content}
                  </Link>
                ) : (
                  <div key={stage.id || stage.label}>{content}</div>
                );
              })}
            </div>
          </section>
        </div>

        {children ? <div className="mt-5">{children}</div> : null}

        {tools.length ? (
          <section className="mt-5 rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">
                  <Sparkles size={12} className="text-[#A37849]" />
                  Specialist tools
                </div>
                <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.02em] text-[#1C1B19]">
                  Open a detailed workspace when needed
                </h2>
              </div>
              <div className="inline-flex items-center gap-1.5 text-[10px] text-[#AAA69E]">
                <Clock3 size={11} /> Daily work stays above
              </div>
            </div>

            <div className="mt-2 grid gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
              {tools.map((tool) => {
                const href = hrefFor(organizationId, tool.route);
                if (!href) return null;
                return (
                  <Link
                    key={tool.id || tool.label}
                    href={href}
                    className="group flex items-center justify-between gap-4 border-b border-black/[0.06] py-3.5"
                  >
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium text-[#35322E] group-hover:text-[#8D6338]">{tool.label}</div>
                      {tool.description ? <div className="mt-1 truncate text-[10px] text-[#9A968E]">{tool.description}</div> : null}
                    </div>
                    <ArrowRight size={12} className="shrink-0 text-[#B7B3AB] group-hover:text-[#B2814E]" />
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {profile?.boundary ? (
          <div className="mt-5 rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.05] px-4 py-3 text-[11px] leading-5 text-[#6F604F]">
            {profile.boundary}
          </div>
        ) : null}
      </div>
    </main>
  );
}
