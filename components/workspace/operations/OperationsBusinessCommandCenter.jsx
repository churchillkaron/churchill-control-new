"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { getOperationsWorkspaceGroups } from "@/lib/operations/registry/OperationsWorkspaceResolver";
import {
  hasOperationsPermission,
  OPERATIONS_ACTIONS,
} from "@/lib/operations/security/OperationsAuthorizationPolicy";
import useOperationsAccess from "@/lib/operations/security/useOperationsAccess";
import useOperationsReadiness from "@/lib/operations/readiness/useOperationsReadiness";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";
import { resolveOrganizationOperationalSolutions } from "@/lib/platform/solutions/OrganizationOperationalSolutionRegistry";

const DAILY_CAPABILITIES = Object.freeze([
  "queue-entries",
  "work-items",
  "operational-runs",
  "dispatch",
  "assignments",
  "handoffs",
  "incidents",
  "exceptions-holds",
  "escalations",
  "quality-checks",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function titleCase(value) {
  return clean(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
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

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function moveFor(row) {
  if (row?.next_move) {
    return {
      title: row.next_move,
      detail: row.next_move_detail || "Open the work to resolve the surfaced operating condition.",
      state: row.actionability_state || "ATTENTION",
    };
  }
  if (row?.overdue) return { title: "Recover overdue work", detail: "Protect the missed commitment before healthy work is reshuffled.", state: "ATTENTION" };
  if (!row?.assigned_to) return { title: "Assign accountable owner", detail: "This work cannot move reliably until ownership is explicit.", state: "UNASSIGNED" };
  if (row?.high_priority) return { title: "Protect priority work", detail: "Confirm timing and constraints before lower-priority work.", state: "PRIORITY" };
  return { title: "Continue active work", detail: "This item is active in the operating flow.", state: "ACTIVE" };
}

function stateTone(value) {
  const normalized = clean(value).toLowerCase();
  if (normalized.includes("attention") || normalized.includes("overdue")) return "border-[#B36B52]/20 bg-[#B36B52]/[0.07] text-[#98513D]";
  if (normalized.includes("priority") || normalized.includes("due_soon")) return "border-[#C08A4A]/20 bg-[#C08A4A]/[0.08] text-[#8B6236]";
  if (normalized.includes("unassigned")) return "border-[#A37849]/18 bg-[#A37849]/[0.06] text-[#76583A]";
  if (normalized.includes("today") || normalized.includes("active")) return "border-[#748267]/18 bg-[#748267]/[0.06] text-[#607057]";
  return "border-black/[0.07] bg-[#F7F6F3] text-[#77736C]";
}

function Metric({ label, value, detail, attention = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">{label}</div>
      <div className={`mt-2.5 text-[24px] font-medium tracking-[-0.035em] ${attention && Number(value) > 0 ? "text-[#98513D]" : "text-[#1A1917]"}`}>{value}</div>
      <div className="mt-1 text-[10px] leading-4 text-[#9A968E]">{detail}</div>
    </div>
  );
}

export default function OperationsBusinessCommandCenter() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId = clean(params?.organizationId || businessContext.organization_id || businessContext.organization?.id);
  const entityId = clean(businessContext.entity_id || businessContext.entity?.id);
  const periodId = clean(businessContext.period_id || businessContext.period?.id);
  const organization = businessContext.organization || null;
  const organizationName = organization?.name || "Organization";
  const entityName = businessContext.entity?.display_name || businessContext.entity?.legal_name || businessContext.entity?.name || "All entities";
  const periodName = businessContext.period?.name || businessContext.period?.period_name || businessContext.period?.label || "Current period";
  const access = useOperationsAccess({ organizationId, entityId, periodId });
  const readiness = useOperationsReadiness({ organizationId, entityId, periodId });
  const [showManagement, setShowManagement] = useState(false);
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const solutions = useMemo(
    () => resolveOrganizationOperationalSolutions({ organization, organizationId }),
    [organization, organizationId],
  );

  const authorisedGroups = useMemo(() => (
    getOperationsWorkspaceGroups()
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => hasOperationsPermission({
          permissions: access.permissions,
          capabilityId: item.capabilityId,
          action: item.readOnly ? OPERATIONS_ACTIONS.AUDIT : OPERATIONS_ACTIONS.VIEW,
        })),
      }))
      .filter((group) => group.items.length)
  ), [access.permissions]);

  const itemsByCapability = useMemo(() => new Map(
    authorisedGroups.flatMap((group) => group.items).map((item) => [item.capabilityId, item]),
  ), [authorisedGroups]);

  const dailyItems = useMemo(
    () => DAILY_CAPABILITIES.map((id) => itemsByCapability.get(id)).filter(Boolean),
    [itemsByCapability],
  );

  const capabilityQuery = useMemo(
    () => dailyItems.map((item) => item.capabilityId).join(","),
    [dailyItems],
  );

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId || access.loading) return;
    if (!silent) setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const query = new URLSearchParams({
        organization_id: organizationId,
        capabilities: capabilityQuery,
      });
      if (entityId) query.set("entity_id", entityId);
      if (periodId) query.set("period_id", periodId);

      const response = await fetch(`/api/operations/command-center?${query.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) throw new Error(result.error || "Unable to load Operations state");
      setState({ loading: false, error: null, data: result });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Unable to load Operations state" }));
    }
  }, [access.loading, capabilityQuery, entityId, organizationId, periodId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onFocus = () => load({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const metrics = state.data?.metrics || {};
  const attention = Array.isArray(state.data?.attention) ? state.data.attention : [];
  const today = Array.isArray(state.data?.today) ? state.data.today : [];

  const itemHref = (item) => resolveWorkspaceRoute({
    organizationId,
    workspaceId: "operations",
    moduleId: item.capabilityId,
    route: item.route,
  });

  if (access.loading) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing Operations...</div>;
  }

  if (access.error) {
    return (
      <div className="min-h-[420px] bg-[#F7F6F3] p-8">
        <div className="rounded-2xl border border-[#B36B52]/20 bg-[#B36B52]/[0.06] p-5 text-sm text-[#8B4937]">Operations access could not be resolved: {access.error}</div>
      </div>
    );
  }

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-5 py-7 text-[#191919] md:px-8 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-[1780px]">
        <header className="flex flex-col gap-5 border-b border-black/[0.07] pb-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 max-w-4xl">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9A744B]">Operations</div>
            <h1 className="mt-2 text-[30px] font-medium tracking-[-0.04em] text-[#181817] md:text-[34px]">Operations</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#6C6963]">Run the business by exception: see what needs judgment now, what is already moving today, and open the right operating application without losing context.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6C6963]">
            <span className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">{organizationName}</span>
            <span className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">{entityName}</span>
            <span className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">{periodName}</span>
            <button type="button" onClick={() => load()} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143] shadow-[0_1px_2px_rgba(0,0,0,0.03)]" aria-label="Refresh Operations">
              <RefreshCw size={11} className={state.loading ? "animate-spin" : ""} />
            </button>
          </div>
        </header>

        {state.error ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] p-3 text-[11px] text-[#8B4937]"><AlertTriangle size={13} />{state.error}</div>
        ) : null}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Attention" value={state.loading ? "…" : Number(metrics.attention || 0)} detail="Work requiring human intervention" attention />
          <Metric label="Scheduled today" value={state.loading ? "…" : Number(metrics.scheduled_today || 0)} detail="Work already in today’s plan" />
          <Metric label="Overdue" value={state.loading ? "…" : Number(metrics.overdue || 0)} detail="Past due and still open" attention />
          <Metric label="Unassigned" value={state.loading ? "…" : Number(metrics.unassigned || 0)} detail="Needs accountable ownership" attention />
          <Metric label="Priority" value={state.loading ? "…" : Number(metrics.high_priority || 0)} detail="High or critical active work" attention />
          <Metric label="Completed today" value={state.loading ? "…" : Number(metrics.completed_today || 0)} detail="Evidence of daily throughput" />
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)] xl:items-start">
          <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.06] px-5 py-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">Needs attention</div>
                <h2 className="mt-1 text-[17px] font-medium tracking-[-0.025em] text-[#23211E]">Next human moves</h2>
                <p className="mt-1 text-[10px] text-[#9A968E]">Server-ranked exceptions only. Healthy work stays quiet.</p>
              </div>
              <div className="text-[9px] text-[#AAA69E]">Live · permission filtered · governed</div>
            </div>

            <div className="hidden grid-cols-[minmax(170px,0.8fr)_minmax(300px,1.4fr)_130px_120px] gap-4 border-b border-black/[0.05] bg-[#FBFAF8] px-5 py-2 text-[8px] font-medium uppercase tracking-[0.1em] text-[#979087] md:grid">
              <span>Work</span><span>Next move</span><span>Due / owner</span><span>State</span>
            </div>

            <div className="divide-y divide-black/[0.055]">
              {!state.loading && !attention.length ? (
                <div className="flex items-center gap-3 px-5 py-8 text-[12px] text-[#77736C]"><CheckCircle2 size={15} className="text-[#718167]" />No surfaced exception currently requires intervention.</div>
              ) : null}
              {attention.slice(0, 10).map((row) => {
                const item = itemsByCapability.get(row.capability_id);
                if (!item) return null;
                const move = moveFor(row);
                return (
                  <Link key={row.id} href={itemHref(item)} className="group grid gap-2 px-5 py-3.5 transition hover:bg-[#FCFBF9] md:grid-cols-[minmax(170px,0.8fr)_minmax(300px,1.4fr)_130px_120px] md:items-center md:gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium text-[#403C37] group-hover:text-[#8D6338]">{row.name || row.code || item.name}</div>
                      <div className="mt-0.5 truncate text-[8px] uppercase tracking-[0.07em] text-[#A09A92]">{item.name}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium text-[#3C3732]">{move.title}</div>
                      <div className="mt-0.5 truncate text-[9px] text-[#8D857D]">{move.detail}</div>
                    </div>
                    <div className="space-y-1 text-[9px] text-[#817A72]">
                      <div className="flex items-center gap-1.5"><Clock3 size={9} className="text-[#A69F97]" />{formatDue(row.due_at)}</div>
                      <div className="flex items-center gap-1.5"><UserRound size={9} className="text-[#A69F97]" />{row.assigned_to ? "Assigned" : "Unassigned"}</div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[8px] font-medium uppercase tracking-[0.06em] ${stateTone(move.state)}`}>{titleCase(move.state)}</span>
                      <ArrowRight size={11} className="text-[#B7B3AB] transition group-hover:translate-x-0.5 group-hover:text-[#A37849]" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="border-b border-black/[0.06] px-5 py-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">Today</div>
              <div className="mt-1 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-medium tracking-[-0.02em] text-[#23211E]">Operating day</h2>
                  <p className="mt-1 text-[9px] text-[#9A968E]">Scheduled and due work in local business time.</p>
                </div>
                <span className="text-[18px] font-medium tracking-[-0.03em] text-[#2C2925]">{state.loading ? "…" : today.length}</span>
              </div>
            </div>
            <div className="divide-y divide-black/[0.055] px-5">
              {!state.loading && today.length === 0 ? <div className="py-6 text-[10px] text-[#8E8981]">No scheduled or due work is surfaced for today.</div> : null}
              {today.slice(0, 8).map((row) => {
                const item = itemsByCapability.get(row.capability_id);
                if (!item) return null;
                return (
                  <Link key={`today-${row.id}`} href={itemHref(item)} className="group grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 py-3">
                    <div className="text-[10px] font-medium tabular-nums text-[#6D675F]">{formatTime(row.scheduled_start || row.due_at)}</div>
                    <div className="min-w-0">
                      <div className="truncate text-[10px] font-medium text-[#48433D] group-hover:text-[#8D6338]">{row.name || row.code || item.name}</div>
                      <div className="mt-0.5 truncate text-[8px] text-[#99948C]">{item.name} · {row.assigned_to ? "Owner assigned" : "Needs owner"}</div>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[7px] font-medium uppercase tracking-[0.05em] ${stateTone(row.actionability_state)}`}>{titleCase(row.actionability_state || "Today")}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        {solutions.length ? (
          <section className="mt-5">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">Operating applications</div>
                <div className="mt-1 text-[11px] text-[#9A968E]">Purpose-built workflows on top of the governed Operations kernel.</div>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {solutions.map((solution) => {
                const primary = solution.items?.[0];
                return (
                  <article key={solution.id} className="rounded-2xl border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-2xl">
                        <div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#9A744B]">{solution.eyebrow}</div>
                        <h3 className="mt-1 text-[16px] font-medium tracking-[-0.02em] text-[#2B2824]">{solution.title}</h3>
                        <p className="mt-1.5 text-[10px] leading-4 text-[#8A857D]">{solution.description}</p>
                      </div>
                      {primary ? <Link href={primary.href} className="inline-flex items-center gap-1.5 rounded-xl border border-[#A37849]/18 bg-[#FBF8F3] px-3 py-2 text-[10px] font-medium text-[#76583A]">Open <ArrowRight size={10} /></Link> : null}
                    </div>
                    <div className="mt-4 grid gap-x-5 border-t border-black/[0.06] pt-1 sm:grid-cols-2 lg:grid-cols-3">
                      {(solution.items || []).slice(1).map((item) => (
                        <Link key={item.id} href={item.href} className="group flex items-center justify-between gap-3 border-b border-black/[0.055] py-3">
                          <div className="min-w-0"><div className="text-[10px] font-medium text-[#4A4640] group-hover:text-[#8D6338]">{item.label}</div><div className="mt-0.5 truncate text-[8px] text-[#9A968E]">{item.description}</div></div>
                          <ArrowRight size={10} className="shrink-0 text-[#B7B3AB]" />
                        </Link>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="mt-5 rounded-2xl border border-[#D6A66A]/18 bg-white p-5 text-[11px] text-[#6F604F]">No industry application is configured, so Avantiqo is showing the neutral Operations kernel.</div>
        )}

        <section className="mt-5 rounded-2xl border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">Management</div>
              <div className="mt-1 text-[11px] text-[#9A968E]">Specialist configuration stays available without crowding the daily operating view.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowManagement((current) => !current)} className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-[10px] text-[#655F58] hover:border-[#D6A66A]/40 hover:text-[#8D6338]"><Settings2 size={10} />{showManagement ? "Hide tools" : "Manage Operations"}</button>
              {access.can?.administer ? <Link href={`/workspace/${organizationId}/operations/access-control`} className="inline-flex items-center gap-1.5 rounded-xl border border-[#A37849]/18 bg-[#FBF8F3] px-3 py-2 text-[10px] text-[#76583A]"><ShieldCheck size={10} />Access</Link> : null}
            </div>
          </div>

          {showManagement ? (
            <div className="mt-4 border-t border-black/[0.06] pt-4">
              <div className="mb-3 text-[9px] text-[#8A857D]">Neutral Operations kernel · Runtime {readiness.loading ? "checking" : readiness.status}</div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {authorisedGroups.map((group) => (
                  <article key={group.id} className="rounded-2xl border border-black/[0.07] bg-[#FBFAF8] p-3">
                    <div className="px-2 py-1"><div className="text-[11px] font-medium text-[#35322E]">{group.name}</div><div className="mt-1 text-[9px] leading-4 text-[#96928A]">{group.description}</div></div>
                    <div className="mt-2 divide-y divide-black/[0.055]">
                      {group.items.map((item) => (
                        <Link key={item.capabilityId} href={itemHref(item)} className="group flex items-center justify-between gap-3 px-2 py-2.5"><span className="truncate text-[10px] text-[#5C5851] group-hover:text-[#8D6338]">{item.name}</span><ArrowRight size={9} className="shrink-0 text-[#B7B3AB]" /></Link>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
