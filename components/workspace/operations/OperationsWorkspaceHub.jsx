"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  TimerReset,
} from "lucide-react";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { getOperationsWorkspaceGroups } from "@/lib/operations/registry/OperationsWorkspaceResolver";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";
import {
  hasOperationsPermission,
  OPERATIONS_ACTIONS,
} from "@/lib/operations/security/OperationsAuthorizationPolicy";
import useOperationsAccess from "@/lib/operations/security/useOperationsAccess";
import useOperationsReadiness from "@/lib/operations/readiness/useOperationsReadiness";

const PRIMARY_ACTIONS = Object.freeze([
  {
    capabilityId: "queue-entries",
    label: "Work Queue",
    description: "Review waiting, prioritised and unassigned operational work.",
    icon: ListTodo,
  },
  {
    capabilityId: "work-items",
    label: "Active Work",
    description: "Open, assign, progress and complete operational work.",
    icon: Activity,
  },
  {
    capabilityId: "operational-runs",
    label: "Active Runs",
    description: "Coordinate repeatable rounds, batches and operating cycles.",
    icon: TimerReset,
  },
  {
    capabilityId: "handoffs",
    label: "Handoffs",
    description: "Transfer ownership and execution context without losing control.",
    icon: GitBranch,
  },
  {
    capabilityId: "incidents",
    label: "Incidents",
    description: "Triage and resolve operational disruption and risk.",
    icon: AlertTriangle,
  },
  {
    capabilityId: "dispatch-boards",
    label: "Dispatch Board",
    description: "See planned, dispatched, assigned and unowned work together.",
    icon: LayoutDashboard,
  },
]);

const COMMAND_SECTIONS = Object.freeze([
  {
    id: "execution",
    title: "Execution",
    description: "Run work, coordinate responsibility and keep delivery moving.",
    icon: Activity,
    capabilityIds: [
      "work-items",
      "operational-runs",
      "assignments",
      "handoffs",
      "dispatch",
      "queue-entries",
    ],
  },
  {
    id: "planning",
    title: "Planning",
    description: "Prepare workload, capacity, schedules and recurring execution.",
    icon: CalendarDays,
    capabilityIds: [
      "operational-plans",
      "work-schedules",
      "capacity-planning",
      "recurring-work",
      "schedule-conflicts",
      "resource-planning",
    ],
  },
  {
    id: "control",
    title: "Control",
    description: "Govern approvals, evidence, exceptions and operational quality.",
    icon: ClipboardCheck,
    capabilityIds: [
      "operational-approvals",
      "checklists",
      "completion-evidence",
      "exceptions-holds",
      "escalations",
      "corrective-actions",
    ],
  },
  {
    id: "intelligence",
    title: "Intelligence",
    description: "Understand live execution, history, events and intervention needs.",
    icon: BarChart3,
    capabilityIds: [
      "operational-events",
      "operational-timeline",
      "work-history",
      "audit-trail",
      "demand-signals",
      "dispatch-boards",
    ],
  },
]);

function matchesQuery(group, item, query) {
  if (!query) return true;

  return [
    group.name,
    group.description,
    item.name,
    item.description,
    item.capabilityId,
    item.lifecycle,
    item.recordType,
    ...(item.consumes || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function readinessLabel(status) {
  if (status === "healthy") return "Runtime healthy";
  if (status === "degraded") return "Runtime degraded";
  if (status === "unavailable") return "Runtime unavailable";
  return "Checking runtime";
}

function workspaceHref({ organizationId, item }) {
  return resolveWorkspaceRoute({
    organizationId,
    workspaceId: "operations",
    moduleId: item.capabilityId,
    route: item.route,
  });
}

function CommandLink({ organizationId, item, compact = false }) {
  return (
    <Link
      href={workspaceHref({ organizationId, item })}
      className={compact
        ? "group flex items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 transition hover:border-[#D6A66A]/25 hover:bg-[#D6A66A]/[0.07]"
        : "group flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 transition hover:border-[#D6A66A]/35 hover:bg-[#D6A66A]/[0.08]"}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white/90">{item.name}</div>
        {!compact ? (
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/40">
            {item.description}
          </div>
        ) : null}
      </div>
      <ArrowRight
        size={15}
        className="shrink-0 text-white/20 transition group-hover:translate-x-0.5 group-hover:text-[#D6A66A]"
      />
    </Link>
  );
}

export default function OperationsWorkspaceHub() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId = params?.organizationId || businessContext.organization_id || null;
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const access = useOperationsAccess({ organizationId, entityId, periodId });
  const readiness = useOperationsReadiness({ organizationId, entityId, periodId });
  const [showAllTools, setShowAllTools] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const authorisedGroups = useMemo(() => (
    getOperationsWorkspaceGroups()
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => hasOperationsPermission({
          permissions: access.permissions,
          capabilityId: item.capabilityId,
          action: item.readOnly
            ? OPERATIONS_ACTIONS.AUDIT
            : OPERATIONS_ACTIONS.VIEW,
        })),
      }))
      .filter((group) => group.items.length > 0)
  ), [access.permissions]);

  const authorisedItems = useMemo(() => authorisedGroups.flatMap((group) => (
    group.items.map((item) => ({
      ...item,
      groupId: group.id,
      groupName: group.name,
    }))
  )), [authorisedGroups]);

  const itemsByCapabilityId = useMemo(() => new Map(
    authorisedItems.map((item) => [item.capabilityId, item]),
  ), [authorisedItems]);

  const primaryActions = useMemo(() => PRIMARY_ACTIONS
    .map((action) => {
      const item = itemsByCapabilityId.get(action.capabilityId);
      return item ? { ...action, item } : null;
    })
    .filter(Boolean), [itemsByCapabilityId]);

  const commandSections = useMemo(() => COMMAND_SECTIONS
    .map((section) => ({
      ...section,
      items: section.capabilityIds
        .map((capabilityId) => itemsByCapabilityId.get(capabilityId))
        .filter(Boolean),
    }))
    .filter((section) => section.items.length > 0), [itemsByCapabilityId]);

  const filteredGroups = useMemo(() => authorisedGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => matchesQuery(group, item, normalizedQuery)),
    }))
    .filter((group) => group.items.length > 0), [authorisedGroups, normalizedQuery]);

  const totalAuthorisedCapabilities = authorisedItems.length;
  const visibleCapabilities = filteredGroups.reduce(
    (sum, group) => sum + group.items.length,
    0,
  );
  const genuinelyHasNoAccess = !access.loading
    && !access.error
    && totalAuthorisedCapabilities === 0;
  const queryHasNoMatches = showAllTools
    && normalizedQuery
    && visibleCapabilities === 0;

  return (
    <main className="min-h-screen px-6 pb-12 pt-10 text-white md:pt-12">
      <div className="mx-auto max-w-[1540px]">
        <WorkspaceHeader
          workspace="Operations"
          title="Operations Command Center"
          description="Run today's work, coordinate assignments, resolve exceptions and monitor operational execution."
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAllTools((current) => !current)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/60 transition hover:border-[#D6A66A]/30 hover:text-white"
              >
                <Settings2 size={15} />
                {showAllTools ? "Close All Tools" : "All Operations Tools"}
              </button>

              {access.can?.administer ? (
                <Link
                  href={`/workspace/${organizationId}/operations/access-control`}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-4 py-2 text-sm text-[#D6A66A]"
                >
                  <ShieldCheck size={15} /> Access Control
                </Link>
              ) : null}
            </div>
          )}
        />

        {access.loading ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.035] p-8 text-sm text-white/50">
            <LoaderCircle className="mr-3 animate-spin text-[#D6A66A]" size={20} />
            Preparing your Operations command center...
          </div>
        ) : access.error ? (
          <div className="rounded-[28px] border border-red-400/25 bg-red-500/10 p-8">
            <div className="flex items-start gap-4">
              <AlertTriangle className="mt-0.5 text-red-300" size={22} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-red-100">Operations access failed to load</div>
                <div className="mt-2 text-sm leading-6 text-red-100/65">{access.error}</div>
                <button
                  type="button"
                  onClick={access.refresh}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl border border-red-300/25 bg-black/20 px-4 py-2 text-sm text-red-100"
                >
                  <RefreshCw size={15} /> Retry Access Check
                </button>
              </div>
            </div>
          </div>
        ) : genuinelyHasNoAccess ? (
          <div className="rounded-[28px] border border-amber-300/20 bg-amber-300/[0.06] p-8">
            <div className="flex items-start gap-4">
              <ShieldCheck className="mt-0.5 text-[#D6A66A]" size={22} />
              <div>
                <div className="font-semibold text-white">No Operations role is assigned</div>
                <div className="mt-2 text-sm leading-6 text-white/50">
                  Your organisation membership is active, but it does not currently grant an Operations role. Ask an Operations administrator to assign the appropriate access bundle.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/20 md:p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">Today</div>
                  <h2 className="mt-2 text-xl font-semibold text-white">Where work needs attention</h2>
                  <p className="mt-1 text-sm leading-6 text-white/40">
                    Start with live execution surfaces instead of navigating the full capability catalogue.
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-white/40">
                  Role and context filtered
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                {primaryActions.map(({ capabilityId, label, description, icon: Icon, item }) => (
                  <Link
                    key={capabilityId}
                    href={workspaceHref({ organizationId, item })}
                    className="group min-h-[168px] rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5 hover:border-[#D6A66A]/40 hover:bg-[#D6A66A]/[0.08]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.08] p-2.5 text-[#D6A66A]">
                        <Icon size={18} />
                      </div>
                      <ArrowRight
                        size={16}
                        className="mt-2 text-white/20 transition group-hover:translate-x-0.5 group-hover:text-[#D6A66A]"
                      />
                    </div>
                    <div className="mt-4 text-sm font-semibold text-white">{label}</div>
                    <div className="mt-1.5 text-xs leading-5 text-white/40">{description}</div>
                  </Link>
                ))}
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              {commandSections.map((section) => {
                const Icon = section.icon;

                return (
                  <article
                    key={section.id}
                    className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"
                  >
                    <div className="mb-4 flex items-start gap-3">
                      <div className="rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.07] p-2.5 text-[#D6A66A]">
                        <Icon size={18} />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-white">{section.title}</h2>
                        <p className="mt-1 text-xs leading-5 text-white/40">{section.description}</p>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {section.items.map((item) => (
                        <CommandLink
                          key={item.capabilityId}
                          organizationId={organizationId}
                          item={item}
                        />
                      ))}
                    </div>
                  </article>
                );
              })}
            </section>

            {access.can?.administer ? (
              <section className={`rounded-2xl border p-4 ${readiness.status === "healthy" ? "border-emerald-400/20 bg-emerald-500/[0.045]" : readiness.status === "degraded" ? "border-amber-300/20 bg-amber-300/[0.05]" : "border-red-400/20 bg-red-500/[0.055]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {readiness.loading ? (
                      <LoaderCircle className="animate-spin text-[#D6A66A]" size={18} />
                    ) : readiness.status === "healthy" ? (
                      <CheckCircle2 className="text-emerald-300" size={18} />
                    ) : (
                      <AlertTriangle className="text-amber-200" size={18} />
                    )}
                    <div>
                      <div className="text-sm font-medium text-white/80">{readinessLabel(readiness.status)}</div>
                      <div className="mt-0.5 text-xs text-white/40">
                        {readiness.loading
                          ? "Checking execution, events, lifecycle and security contracts..."
                          : readiness.status === "healthy"
                            ? "Operations runtime contracts are available."
                            : `${readiness.blocking_failures.length} blocking issue(s) and ${readiness.warnings.length} warning(s) require review.`}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={readiness.refresh}
                    disabled={readiness.loading}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/50 transition hover:text-white disabled:opacity-50"
                  >
                    <RefreshCw size={14} /> Recheck Runtime
                  </button>
                </div>

                {!readiness.loading && readiness.blocking_failures.length > 0 ? (
                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {readiness.blocking_failures.map((failure) => (
                      <div key={failure.key} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs font-semibold text-white/70">{failure.key}</div>
                        <div className="mt-1 text-[11px] leading-5 text-white/40">
                          {failure.error?.message || "Required Operations contract is unavailable."}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {showAllTools ? (
              <section className="rounded-[30px] border border-white/10 bg-black/25 p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">All Operations Tools</div>
                    <h2 className="mt-2 text-xl font-semibold text-white">Capability directory</h2>
                    <p className="mt-1 text-sm leading-6 text-white/40">
                      Configuration and specialist tools are available here without crowding the command center.
                    </p>
                  </div>

                  <div className="flex w-full items-center rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white/50 md:w-[390px]">
                    <Search size={16} />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search authorised Operations tools..."
                      className="ml-3 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-white/30">
                  <span>{visibleCapabilities} of {totalAuthorisedCapabilities} authorised tools</span>
                  <button
                    type="button"
                    onClick={() => setShowAllTools(false)}
                    className="inline-flex items-center gap-2 text-white/50 transition hover:text-white"
                  >
                    Close directory <ChevronDown size={14} className="rotate-180" />
                  </button>
                </div>

                {queryHasNoMatches ? (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-6 text-sm text-white/40">
                    No authorised Operations tools match "{query}".
                  </div>
                ) : (
                  <div className="mt-5 grid max-h-[760px] gap-4 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
                    {filteredGroups.map((group) => (
                      <article
                        key={group.id}
                        className="self-start rounded-2xl border border-white/10 bg-white/[0.025] p-3"
                      >
                        <div className="flex items-start justify-between gap-3 px-2 pb-2 pt-1">
                          <div>
                            <h3 className="text-sm font-semibold text-white/90">{group.name}</h3>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/30">
                              {group.description}
                            </p>
                          </div>
                          <div className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-white/30">
                            {group.items.length}
                          </div>
                        </div>

                        <div className="mt-1 space-y-0.5 border-t border-white/10 pt-1">
                          {group.items.map((item) => (
                            <CommandLink
                              key={item.capabilityId}
                              organizationId={organizationId}
                              item={item}
                              compact
                            />
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
