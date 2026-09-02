"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDotDashed,
  FolderKanban,
  Gauge,
  RefreshCw,
  Search,
  ShieldCheck,
  TimerReset,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { getWorkspaceGroups } from "@/lib/platform/registry/erpRegistry";

function text(value) {
  return String(value ?? "").trim();
}

function titleCase(value) {
  return text(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function workspaceHref(organizationId, route) {
  if (!organizationId || !route) return "#";
  if (route.startsWith("/workspace/")) return route;
  return `/workspace/${encodeURIComponent(organizationId)}${route.startsWith("/") ? route : `/${route}`}`;
}

function MetricCard({ icon: Icon, label, value, detail, attention = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8E8A82]">{label}</div>
        <Icon size={15} className="text-[#A37849]" />
      </div>
      <div className={`mt-3 text-[27px] font-medium tracking-[-0.04em] ${attention && Number(value) > 0 ? "text-[#9A533D]" : "text-[#1A1917]"}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] leading-5 text-[#9A968E]">{detail}</div>
    </div>
  );
}

function healthStyle(health) {
  if (health === "off_track") return "border-[#B36B52]/20 bg-[#B36B52]/[0.07] text-[#9A533D]";
  if (health === "watch") return "border-[#B48A50]/20 bg-[#B48A50]/[0.07] text-[#8B693E]";
  if (health === "on_track") return "border-[#718167]/20 bg-[#718167]/[0.07] text-[#5F7052]";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#747069]";
}

function PriorityPill({ priority }) {
  const attention = priority === "attention";
  return (
    <span className={attention
      ? "rounded-full border border-[#B36B52]/20 bg-[#B36B52]/[0.07] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-[#9A533D]"
      : "rounded-full border border-[#C0A070]/20 bg-[#C0A070]/[0.07] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-[#8B693E]"}
    >
      {attention ? "Attention" : "Review"}
    </span>
  );
}

export default function ProjectsCommandCenter({ organizationId: organizationIdProp }) {
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

  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [query, setQuery] = useState("");

  const projectGroups = useMemo(() => getWorkspaceGroups("projects"), []);
  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projectGroups;
    return projectGroups
      .map((group) => ({
        ...group,
        items: (group.items || []).filter((item) =>
          [group.name, group.description, item.name, item.description]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(needle),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [projectGroups, query]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (!silent) setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const params = new URLSearchParams({ organizationId });
      if (entityId) params.set("entityId", entityId);
      if (periodId) params.set("periodId", periodId);
      const response = await fetch(`/api/workspace/projects/command-center?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load Projects workspace");
      }
      setState({ loading: false, error: null, data: result });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Unable to load Projects workspace",
      }));
    }
  }, [entityId, organizationId, periodId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () => load({ silent: true });
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);

  const metrics = state.data?.metrics || {};
  const queue = Array.isArray(state.data?.queue) ? state.data.queue : [];
  const portfolio = Array.isArray(state.data?.portfolio) ? state.data.portfolio : [];
  const depth = state.data?.capability_depth || {};

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-6 text-[#191919] md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1640px]">
        <header className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-4xl">
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#A37849]">Projects · Portfolio</div>
              <h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em] text-[#1B1A18] md:text-[36px]">Project Delivery Command Center</h1>
              <p className="mt-2.5 max-w-3xl text-[13px] leading-6 text-[#6F6B64]">
                See portfolio health, deadlines and planning exceptions first. Detailed project controls stay connected underneath instead of becoming separate project silos.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#77736C]">
              <span className="rounded-full border border-black/[0.08] bg-[#FBFAF8] px-3 py-1.5">{businessContext.organization?.name || "Organization"}</span>
              <span className="rounded-full border border-black/[0.08] bg-[#FBFAF8] px-3 py-1.5">{entityName}</span>
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
        </header>

        {state.error ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#B36B52]/20 bg-[#B36B52]/[0.06] px-4 py-3 text-[12px] text-[#8B4937]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Project portfolio data could not be loaded.</div>
              <div className="mt-1 opacity-80">{state.error}</div>
            </div>
          </div>
        ) : null}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard icon={FolderKanban} label="Active projects" value={state.loading ? "…" : Number(metrics.portfolio?.active || 0)} detail={`${Number(metrics.portfolio?.total || 0)} total · ${Number(metrics.portfolio?.completed || 0)} completed`} />
          <MetricCard icon={AlertTriangle} label="Overdue" value={state.loading ? "…" : Number(metrics.schedule?.overdue || 0)} detail="Active projects past planned finish" attention />
          <MetricCard icon={CalendarClock} label="Due in 30 days" value={state.loading ? "…" : Number(metrics.schedule?.due_30_days || 0)} detail="Upcoming portfolio deadlines" attention={Number(metrics.schedule?.due_30_days || 0) > 0} />
          <MetricCard icon={CircleDotDashed} label="Planning gaps" value={state.loading ? "…" : Number(metrics.schedule?.missing_dates || 0)} detail="Active projects missing start or finish" attention />
          <MetricCard icon={ShieldCheck} label="Scope gaps" value={state.loading ? "…" : Number(metrics.governance?.missing_entity || 0)} detail="Projects without legal-entity scope" attention />
          <MetricCard icon={TimerReset} label="Future projects" value={state.loading ? "…" : Number(metrics.schedule?.future || 0)} detail="Planned projects not started yet" />
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(390px,0.85fr)]">
          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex items-end justify-between gap-4 border-b border-black/[0.07] pb-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">Portfolio attention</div>
                <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1C1B19]">What can put delivery at risk</h2>
              </div>
              <div className="text-[10px] text-[#AAA69E]">Current canonical project truth</div>
            </div>

            <div className="divide-y divide-black/[0.06]">
              {!state.loading && queue.length === 0 ? (
                <div className="flex items-center gap-3 py-8 text-[12px] text-[#77736C]">
                  <CheckCircle2 size={16} className="text-[#718167]" />
                  No current project-level schedule or scope exceptions.
                </div>
              ) : null}
              {queue.map((item) => (
                <Link
                  key={item.id}
                  href={workspaceHref(organizationId, item.href)}
                  className="group grid gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-[13px] font-medium text-[#292723] group-hover:text-[#8D6338]">{item.title}</div>
                      <PriorityPill priority={item.priority} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#9A968E]">
                      <span>{titleCase(item.kind)}</span>
                      {item.detail ? <span>{item.detail}</span> : null}
                      {item.status ? <span>{titleCase(item.status)}</span> : null}
                    </div>
                  </div>
                  <ArrowRight size={13} className="hidden text-[#B7B3AB] transition group-hover:translate-x-0.5 group-hover:text-[#B2814E] sm:block" />
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="border-b border-black/[0.07] pb-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">Portfolio health</div>
              <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1C1B19]">Projects to watch</h2>
            </div>
            <div className="mt-2 divide-y divide-black/[0.06]">
              {portfolio.slice(0, 10).map((project) => (
                <Link
                  key={project.id}
                  href={workspaceHref(organizationId, `/projects?projectId=${encodeURIComponent(project.id)}`)}
                  className="group flex items-center gap-3 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-[12px] font-medium text-[#35322E] group-hover:text-[#8D6338]">{project.name || project.code || "Project"}</div>
                      <span className={`rounded-full border px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] ${healthStyle(project.health)}`}>
                        {titleCase(project.health)}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-[#9A968E]">
                      {[project.code, project.end_date ? `Finish ${project.end_date}` : "Finish date missing"].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <ArrowRight size={12} className="text-[#C0BCB4]" />
                </Link>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-[24px] border border-[#A37849]/20 bg-[#A37849]/[0.045] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-4xl">
              <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D6338]">
                <Gauge size={13} /> Project-control depth
              </div>
              <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.02em] text-[#2A2722]">Advanced controls are not being faked</h2>
              <p className="mt-2 text-[11px] leading-5 text-[#746858]">
                Avantiqo currently has canonical portfolio projects, but milestones, work breakdown, dependencies, project risks, resource capacity and project financials are not yet first-class project records. Those need a governed project-control foundation before Avantiqo should display Primavera/Jira-style dependency, capacity or cost-risk metrics.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-4">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">Explore Projects</div>
              <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.02em] text-[#1C1B19]">Existing project workspaces</h2>
            </div>
            <div className="relative w-full sm:w-[300px]">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A39A]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a project workspace…"
                className="h-10 w-full rounded-xl border border-black/[0.09] bg-[#FBFAF8] pl-9 pr-3 text-[12px] outline-none placeholder:text-[#AAA69E] focus:border-[#D6A66A]/60"
              />
            </div>
          </div>

          <div className="mt-2 grid gap-5 xl:grid-cols-2">
            {filteredGroups.map((group) => (
              <div key={group.id}>
                <div className="py-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[#8D8982]">{group.name}</div>
                <div className="divide-y divide-black/[0.06] border-t border-black/[0.06]">
                  {(group.items || []).map((item) => (
                    <Link
                      key={item.id}
                      href={workspaceHref(organizationId, item.route)}
                      className="group flex items-center justify-between gap-4 py-3.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-[12px] font-medium text-[#35322E] group-hover:text-[#8D6338]">{item.name}</div>
                          {item.status === "planned" ? (
                            <span className="rounded-full border border-black/[0.08] bg-[#F7F6F3] px-2 py-0.5 text-[8px] uppercase tracking-[0.1em] text-[#8E8A82]">Planned</span>
                          ) : null}
                        </div>
                        {item.description ? <div className="mt-1 truncate text-[10px] text-[#9A968E]">{item.description}</div> : null}
                      </div>
                      <ArrowRight size={12} className="shrink-0 text-[#B7B3AB] group-hover:text-[#B2814E]" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
