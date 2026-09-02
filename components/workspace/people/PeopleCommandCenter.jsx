"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
  WalletCards,
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

export default function PeopleCommandCenter({ organizationId: organizationIdProp }) {
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
    "Select legal entity";
  const periodName =
    businessContext.period?.name ||
    businessContext.period?.period_name ||
    businessContext.period?.label ||
    null;

  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [query, setQuery] = useState("");

  const peopleGroups = useMemo(() => getWorkspaceGroups("people"), []);
  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return peopleGroups;
    return peopleGroups
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
  }, [peopleGroups, query]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (!silent) setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const params = new URLSearchParams({ organizationId });
      if (entityId) params.set("entityId", entityId);
      if (periodId) params.set("periodId", periodId);
      const response = await fetch(`/api/workspace/people/command-center?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load People workspace");
      }
      setState({ loading: false, error: null, data: result });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Unable to load People workspace",
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
  const flow = Array.isArray(state.data?.flow) ? state.data.flow : [];
  const payroll = state.data?.payroll || null;

  const quickActions = [
    { label: "Schedule", route: "/people/scheduling" },
    { label: "Attendance", route: "/people/attendance" },
    { label: "Requests", route: "/people/requests" },
    { label: "Payroll", route: "/people/payroll" },
    { label: "Employees", route: "/people/directory" },
  ];

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-6 text-[#191919] md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1640px]">
        <header className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-4xl">
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#A37849]">People · Workforce</div>
              <h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em] text-[#1B1A18] md:text-[36px]">Workforce Command Center</h1>
              <p className="mt-2.5 max-w-3xl text-[13px] leading-6 text-[#6F6B64]">
                Run today’s workforce from one place: staffing, attendance, requests, payroll readiness and employee setup.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#77736C]">
              <span className="rounded-full border border-black/[0.08] bg-[#FBFAF8] px-3 py-1.5">{businessContext.organization?.name || "Organization"}</span>
              <span className="rounded-full border border-black/[0.08] bg-[#FBFAF8] px-3 py-1.5">{entityName}</span>
              {periodName ? (
                <span className="rounded-full border border-black/[0.08] bg-[#FBFAF8] px-3 py-1.5">{periodName}</span>
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

          <div className="mt-6 flex flex-wrap gap-2 border-t border-black/[0.07] pt-5">
            {quickActions.map((action, index) => (
              <Link
                key={action.route}
                href={workspaceHref(organizationId, action.route)}
                className={index === 0
                  ? "inline-flex items-center gap-2 rounded-xl bg-[#1D1B18] px-4 py-2.5 text-[12px] font-medium text-white transition hover:bg-black"
                  : "inline-flex items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-4 py-2.5 text-[12px] font-medium text-[#4E4A44] transition hover:border-[#D6A66A]/45 hover:text-[#8D6338]"}
              >
                {action.label}
                <ArrowRight size={13} />
              </Link>
            ))}
          </div>
        </header>

        {!entityId ? (
          <div className="mt-4 rounded-2xl border border-amber-700/15 bg-amber-50 p-5 text-[13px] text-amber-900">
            Select a legal entity in the top bar to open the working People view.
          </div>
        ) : null}

        {state.error ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#B36B52]/20 bg-[#B36B52]/[0.06] px-4 py-3 text-[12px] text-[#8B4937]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">People data could not be loaded.</div>
              <div className="mt-1 opacity-80">{state.error}</div>
            </div>
          </div>
        ) : null}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard icon={UsersRound} label="Employees" value={state.loading ? "…" : Number(metrics.people?.active || 0)} detail={`${Number(metrics.people?.compensation_missing || 0)} setup gaps`} attention={Number(metrics.people?.compensation_missing || 0) > 0} />
          <MetricCard icon={CalendarDays} label="Scheduled today" value={state.loading ? "…" : Number(metrics.today?.scheduled || 0)} detail={`${Number(metrics.today?.unassigned_shifts || 0)} unassigned shifts`} attention={Number(metrics.today?.unassigned_shifts || 0) > 0} />
          <MetricCard icon={UserRoundCheck} label="On duty" value={state.loading ? "…" : Number(metrics.today?.on_duty || 0)} detail={`${Number(metrics.today?.on_leave || 0)} on approved leave`} />
          <MetricCard icon={UserRoundX} label="Attendance" value={state.loading ? "…" : Number(metrics.today?.attendance_exceptions || 0)} detail="Missing, late or absent evidence" attention />
          <MetricCard icon={Clock3} label="Requests" value={state.loading ? "…" : Number(metrics.requests?.total || 0)} detail={`${Number(metrics.requests?.time_off || 0)} time off · ${Number(metrics.requests?.shift_swaps || 0)} swaps`} attention={Number(metrics.requests?.total || 0) > 0} />
          <MetricCard icon={WalletCards} label="Payroll blockers" value={state.loading ? "…" : Number(metrics.payroll?.actionable_blockers || 0) + Number(metrics.payroll?.review_required || 0)} detail={`${Number(metrics.payroll?.warnings || 0)} warnings · ${Number(metrics.payroll?.disputes || 0)} disputes`} attention />
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(390px,0.85fr)]">
          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex items-end justify-between gap-4 border-b border-black/[0.07] pb-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">Manager queue</div>
                <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1C1B19]">What needs action now</h2>
              </div>
              <div className="text-[10px] text-[#AAA69E]">Live workforce state</div>
            </div>

            <div className="divide-y divide-black/[0.06]">
              {!state.loading && queue.length === 0 ? (
                <div className="flex items-center gap-3 py-8 text-[12px] text-[#77736C]">
                  <CheckCircle2 size={16} className="text-[#718167]" />
                  No workforce exceptions need attention right now.
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
              <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">Workforce lifecycle</div>
              <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1C1B19]">Schedule to payroll</h2>
            </div>

            <div className="mt-2 divide-y divide-black/[0.06]">
              {flow.map((stage, index) => (
                <Link
                  key={stage.id}
                  href={workspaceHref(organizationId, stage.href)}
                  className="flex items-center gap-3 py-3.5 transition hover:bg-[#FBFAF8]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/[0.08] bg-[#FBFAF8] text-[11px] font-medium text-[#77736C]">{index + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[12px] font-medium text-[#35322E]">{stage.label}</div>
                      <div className="text-[16px] font-medium text-[#1F1D1A]">{state.loading ? "…" : Number(stage.count || 0)}</div>
                    </div>
                    <div className="mt-0.5 text-[10px] leading-4 text-[#9A968E]">{stage.detail}</div>
                  </div>
                  <ArrowRight size={12} className="text-[#C0BCB4]" />
                </Link>
              ))}
            </div>
          </section>
        </div>

        {payroll ? (
          <section className="mt-5 rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[0.07] pb-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">
                  <ShieldCheck size={12} className="text-[#A37849]" /> Payroll readiness
                </div>
                <h2 className="mt-1.5 text-[19px] font-medium tracking-[-0.02em] text-[#1C1B19]">
                  {payroll.month} · {payroll.can_generate ? "Ready to generate" : payroll.period_open ? "Period still open" : "Action required"}
                </h2>
              </div>
              <Link
                href={workspaceHref(organizationId, "/people/payroll")}
                className="inline-flex items-center gap-2 rounded-xl border border-black/[0.09] px-3.5 py-2 text-[12px] font-medium text-[#4E4A44] hover:border-[#D6A66A]/45 hover:text-[#8D6338]"
              >
                Open payroll <ArrowRight size={13} />
              </Link>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-black/[0.07] bg-[#FBFAF8] p-4">
                <div className="text-[10px] uppercase tracking-[0.15em] text-[#8E8A82]">Blockers</div>
                <div className="mt-2 text-2xl font-medium">{payroll.blocker_count || 0}</div>
              </div>
              <div className="rounded-2xl border border-black/[0.07] bg-[#FBFAF8] p-4">
                <div className="text-[10px] uppercase tracking-[0.15em] text-[#8E8A82]">Warnings</div>
                <div className="mt-2 text-2xl font-medium">{payroll.warning_count || 0}</div>
              </div>
              <div className="rounded-2xl border border-black/[0.07] bg-[#FBFAF8] p-4">
                <div className="text-[10px] uppercase tracking-[0.15em] text-[#8E8A82]">Lifecycle</div>
                <div className="mt-2 text-sm font-medium">{payroll.can_complete_lifecycle ? "Ready" : "Not ready"}</div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-5 rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-4">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">Explore People</div>
              <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.02em] text-[#1C1B19]">Specialist workforce and payroll tools</h2>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a People workspace…"
              className="h-10 w-full rounded-xl border border-black/[0.09] bg-[#FBFAF8] px-3 text-[12px] outline-none placeholder:text-[#AAA69E] focus:border-[#D6A66A]/60 sm:w-[280px]"
            />
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
                        <div className="text-[12px] font-medium text-[#35322E] group-hover:text-[#8D6338]">{item.name}</div>
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
