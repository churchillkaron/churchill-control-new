"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
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

function formatDue(value) {
  if (!value) return "No deadline";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No deadline";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function nextHumanMove(item) {
  if (item?.overdue) {
    return {
      title: "Recover overdue work",
      detail: "This commitment is already late. Protect the customer promise before moving healthy work.",
      state: "Attention",
    };
  }
  if (!item?.assigned_to) {
    return {
      title: "Assign accountable owner",
      detail: "No person owns the next move yet. Assign before execution or dispatch continues.",
      state: "Unassigned",
    };
  }
  if (item?.high_priority) {
    return {
      title: "Protect priority work",
      detail: "High-priority work is active. Confirm timing, ownership and constraints before lower-priority work.",
      state: "Priority",
    };
  }
  if (item?.due_at) {
    return {
      title: "Move scheduled work",
      detail: "Keep the committed work moving through its next governed execution step.",
      state: "Due",
    };
  }
  return {
    title: "Continue active work",
    detail: "The item is active and surfaced by the live operating queue.",
    state: "Active",
  };
}

function stateTone(value) {
  const normalized = text(value).toLowerCase();
  if (normalized.includes("attention") || normalized.includes("overdue")) {
    return "border-[#B36B52]/20 bg-[#B36B52]/[0.07] text-[#98513D]";
  }
  if (normalized.includes("priority")) {
    return "border-[#C08A4A]/20 bg-[#C08A4A]/[0.08] text-[#8B6236]";
  }
  if (normalized.includes("unassigned")) {
    return "border-[#A37849]/18 bg-[#A37849]/[0.06] text-[#76583A]";
  }
  return "border-black/[0.07] bg-[#F7F6F3] text-[#77736C]";
}

function MetricCard({ label, value, detail, attention = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">{label}</div>
      <div className={`mt-2.5 text-[24px] font-medium tracking-[-0.035em] ${attention && Number(value) > 0 ? "text-[#98513D]" : "text-[#1A1917]"}`}>
        {value}
      </div>
      <div className="mt-1 text-[10px] leading-4 text-[#9A968E]">{detail}</div>
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
    "Current period";

  const capabilityIds = useMemo(
    () => [...new Set((profile?.capabilityIds || []).filter(Boolean))],
    [profile?.capabilityIds],
  );

  const [state, setState] = useState({ loading: true, error: null, data: null });

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (!silent) setState((current) => ({ ...current, loading: true, error: null }));

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
  const guidance = Array.isArray(profile?.guidance) ? profile.guidance : [];
  const metricCards = Array.isArray(profile?.metricCards) && profile.metricCards.length
    ? profile.metricCards
    : [
        { key: "active", label: "Active work", detail: "Open work in this operating context" },
        { key: "due_today", label: "Due today", detail: "Items requiring movement today" },
        { key: "overdue", label: "Overdue", detail: "Open work past its due time", attention: true },
        { key: "unassigned", label: "Unassigned", detail: "Work without accountable ownership", attention: true },
        { key: "high_priority", label: "Priority", detail: "High or critical active work", attention: true },
        { key: "completed_today", label: "Completed today", detail: "Work completed today" },
      ];

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-5 py-7 text-[#191919] md:px-8 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-[1780px]">
        <header className="flex flex-col gap-5 border-b border-black/[0.07] pb-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 max-w-4xl">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9A744B]">
              {profile?.eyebrow || "Operations"}
            </div>
            <h1 className="mt-2 text-[30px] font-medium tracking-[-0.04em] text-[#181817] md:text-[34px]">
              {profile?.title || organizationName || "Operations"}
            </h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#6C6963]">{profile?.description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6C6963]">
            <span className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              {organizationName || businessContext.organization?.name || "Organization"}
            </span>
            <span className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">{entityName}</span>
            <span className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">{periodName}</span>
            <button
              type="button"
              onClick={() => load()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition hover:border-[#D6A66A]/45"
              aria-label="Refresh operating state"
            >
              <RefreshCw size={11} className={state.loading ? "animate-spin" : ""} />
            </button>
          </div>
        </header>

        {state.error ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[11px] text-[#8B4937]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div><span className="font-medium">Live state delayed.</span> {state.error}</div>
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)] xl:items-start">
          <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.06] px-5 py-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">Needs attention</div>
                <h2 className="mt-1 text-[17px] font-medium tracking-[-0.025em] text-[#23211E]">Next human moves</h2>
                <p className="mt-1 text-[10px] text-[#9A968E]">Ranked live work a person can move now.</p>
              </div>
              <div className="text-[9px] text-[#AAA69E]">Live · permission filtered · governed</div>
            </div>

            <div className="hidden grid-cols-[minmax(150px,0.8fr)_minmax(250px,1.35fr)_120px_120px] gap-4 border-b border-black/[0.05] bg-[#FBFAF8] px-5 py-2 text-[8px] font-medium uppercase tracking-[0.1em] text-[#979087] md:grid">
              <span>Work</span><span>Next move</span><span>Due</span><span>State</span>
            </div>

            <div className="divide-y divide-black/[0.055]">
              {!state.loading && attention.length === 0 ? (
                <div className="flex items-center gap-3 px-5 py-8 text-[12px] text-[#77736C]">
                  <CheckCircle2 size={15} className="text-[#718167]" />
                  Nothing currently requires human intervention.
                </div>
              ) : null}

              {attention.slice(0, 10).map((item) => {
                const href = hrefFor(organizationId, `/operations/${item.capability_id}`);
                const move = nextHumanMove(item);
                return (
                  <Link
                    key={item.id}
                    href={href}
                    className="group grid gap-2 px-5 py-3.5 transition hover:bg-[#FCFBF9] md:grid-cols-[minmax(150px,0.8fr)_minmax(250px,1.35fr)_120px_120px] md:items-center md:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium text-[#403C37] group-hover:text-[#8D6338]">
                        {item.name || item.code || titleCase(item.capability_id)}
                      </div>
                      <div className="mt-0.5 truncate text-[8px] uppercase tracking-[0.07em] text-[#A09A92]">{titleCase(item.capability_id)}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium text-[#3C3732]">{move.title}</div>
                      <div className="mt-0.5 truncate text-[9px] text-[#8D857D]">{move.detail}</div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] text-[#817A72]">
                      <Clock3 size={10} className="text-[#A69F97]" /> {formatDue(item.due_at)}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[8px] font-medium uppercase tracking-[0.06em] ${stateTone(move.state)}`}>{move.state}</span>
                      <ArrowRight size={11} className="text-[#B7B3AB] transition group-hover:translate-x-0.5 group-hover:text-[#A37849]" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <div className="space-y-4">
            <section className="rounded-2xl border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">Workflow</div>
              <h2 className="mt-1 text-[16px] font-medium tracking-[-0.02em] text-[#23211E]">Where work is concentrated</h2>
              <div className="mt-3 divide-y divide-black/[0.055]">
                {stages.map((stage, index) => {
                  const count = capabilityCount(capabilityState, stage.capabilityIds);
                  const href = hrefFor(organizationId, stage.route);
                  return (
                    <Link key={stage.id || stage.label} href={href || "#"} className="group flex items-center gap-3 py-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/[0.07] bg-[#FBFAF8] text-[9px] font-medium text-[#77736C]">{index + 1}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] font-medium text-[#4A4640] group-hover:text-[#8D6338]">{stage.label}</span>
                          <span className="text-[14px] font-medium text-[#2C2925]">{state.loading ? "…" : count}</span>
                        </div>
                        <div className="mt-0.5 truncate text-[8px] text-[#99948C]">{stage.description}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>

            {guidance.length ? (
              <section className="rounded-2xl border border-[#A37849]/14 bg-[#FFFDF9] p-5">
                <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A633C]"><Sparkles size={11} /> Operating intelligence</div>
                <div className="mt-3 space-y-2.5">
                  {guidance.map((item) => (
                    <div key={item} className="flex gap-2 text-[10px] leading-4 text-[#746E66]">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#B98C58]" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {metricCards.map((card) => (
            <MetricCard
              key={card.key}
              label={card.label}
              value={state.loading ? "…" : Number(metrics[card.key] || 0)}
              detail={card.detail}
              attention={card.attention}
            />
          ))}
        </section>

        {primaryActions.length ? (
          <section className="mt-5 rounded-2xl border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">Daily controls</div>
                <div className="mt-1 text-[11px] text-[#9A968E]">Open the working surface you need without leaving the operating context.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {primaryActions.map((action) => {
                  const href = hrefFor(organizationId, action.route);
                  if (!href) return null;
                  return (
                    <Link key={action.id || action.label} href={href} className="inline-flex items-center gap-2 rounded-xl border border-[#A37849]/18 bg-[#FBF8F3] px-3.5 py-2 text-[10px] font-medium text-[#76583A] transition hover:border-[#A37849]/35">
                      {action.label}<ArrowRight size={11} />
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {children ? <div className="mt-5">{children}</div> : null}

        {tools.length ? (
          <section className="mt-5 rounded-2xl border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.06] pb-3.5">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">Specialist tools</div>
                <h2 className="mt-1 text-[15px] font-medium tracking-[-0.02em] text-[#23211E]">Details when the daily flow needs them</h2>
              </div>
              <div className="inline-flex items-center gap-1.5 text-[9px] text-[#AAA69E]"><ShieldCheck size={10} /> Daily work stays above</div>
            </div>
            <div className="mt-1 grid gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
              {tools.map((tool) => {
                const href = hrefFor(organizationId, tool.route);
                if (!href) return null;
                return (
                  <Link key={tool.id || tool.label} href={href} className="group flex items-center justify-between gap-4 border-b border-black/[0.055] py-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium text-[#4A4640] group-hover:text-[#8D6338]">{tool.label}</div>
                      <div className="mt-0.5 truncate text-[8px] text-[#9A968E]">{tool.description}</div>
                    </div>
                    <ArrowRight size={10} className="shrink-0 text-[#B7B3AB] group-hover:text-[#A37849]" />
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {profile?.boundary ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#D6A66A]/16 bg-[#D6A66A]/[0.035] px-4 py-3 text-[9px] leading-4 text-[#756B60]">
            <ShieldCheck size={11} className="mt-0.5 shrink-0 text-[#8D6B45]" /> {profile.boundary}
          </div>
        ) : null}
      </div>
    </main>
  );
}
