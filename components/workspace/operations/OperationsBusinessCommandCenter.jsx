"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  LayoutDashboard,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Wrench,
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

function text(value) {
  return String(value ?? "").trim();
}

function metricCard(label, value, detail, attention = false) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8E8A82]">{label}</div>
      <div className={`mt-3 text-[27px] font-medium tracking-[-0.04em] ${attention && Number(value) > 0 ? "text-[#9A533D]" : "text-[#1A1917]"}`}>{value}</div>
      <div className="mt-1.5 text-[11px] leading-5 text-[#9A968E]">{detail}</div>
    </div>
  );
}

export default function OperationsBusinessCommandCenter() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId = text(params?.organizationId || businessContext.organization_id || businessContext.organization?.id);
  const entityId = text(businessContext.entity_id || businessContext.entity?.id);
  const periodId = text(businessContext.period_id || businessContext.period?.id);
  const organization = businessContext.organization || null;
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
      .filter((group) => group.items.length > 0)
  ), [access.permissions]);

  const itemsByCapability = useMemo(() => new Map(
    authorisedGroups.flatMap((group) => group.items).map((item) => [item.capabilityId, item]),
  ), [authorisedGroups]);

  const dailyItems = DAILY_CAPABILITIES
    .map((capabilityId) => itemsByCapability.get(capabilityId))
    .filter(Boolean);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const capabilities = dailyItems.map((item) => item.capabilityId);
      const query = new URLSearchParams({
        organization_id: organizationId,
        capabilities: capabilities.join(","),
      });
      if (entityId) query.set("entity_id", entityId);
      if (periodId) query.set("period_id", periodId);

      const response = await fetch(`/api/operations/command-center?${query.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load Operations state");
      }

      setState({ loading: false, error: null, data: result });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Unable to load Operations state", data: null });
    }
  }, [dailyItems, entityId, organizationId, periodId]);

  useEffect(() => {
    if (access.loading) return;
    load();
  }, [access.loading, load]);

  const metrics = state.data?.metrics || {};
  const attention = Array.isArray(state.data?.attention) ? state.data.attention : [];

  function itemHref(item) {
    return resolveWorkspaceRoute({
      organizationId,
      workspaceId: "operations",
      moduleId: item.capabilityId,
      route: item.route,
    });
  }

  if (access.loading) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing Operations...</div>;
  }

  if (access.error) {
    return (
      <div className="min-h-[420px] bg-[#F7F6F3] p-8">
        <div className="rounded-2xl border border-[#B36B52]/20 bg-[#B36B52]/[0.06] p-5 text-sm text-[#8B4937]">
          Operations access could not be resolved: {access.error}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-6 text-[#191919] md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1640px]">
        <header className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-4xl">
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#A37849]">Operations</div>
              <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.04em] text-[#1B1A18] md:text-[36px]">Operations Command Center</h1>
              <p className="mt-2.5 max-w-3xl text-[13px] leading-6 text-[#6F6B64]">
                Open the operating application configured for this organization. Daily execution comes first; specialist capabilities and runtime administration stay secondary.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={load}
                className="inline-flex items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-4 py-2.5 text-[12px] text-[#5E5A54] hover:border-[#D6A66A]/45 hover:text-[#8D6338]"
              >
                <RefreshCw size={13} className={state.loading ? "animate-spin" : ""} /> Refresh
              </button>
              <button
                type="button"
                onClick={() => setShowManagement((current) => !current)}
                className="inline-flex items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-4 py-2.5 text-[12px] text-[#5E5A54] hover:border-[#D6A66A]/45 hover:text-[#8D6338]"
              >
                <Settings2 size={13} /> {showManagement ? "Hide management" : "Manage Operations"}
              </button>
              {access.can?.administer ? (
                <Link
                  href={`/workspace/${organizationId}/operations/access-control`}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] px-4 py-2.5 text-[12px] text-[#8D6338]"
                >
                  <ShieldCheck size={13} /> Access
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        {solutions.length ? (
          <section className="mt-5">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">Installed operating solution</div>
                <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1C1B19]">Start where the work happens</h2>
              </div>
            </div>

            <div className={`grid gap-4 ${solutions.length > 1 ? "xl:grid-cols-2" : ""}`}>
              {solutions.map((solution) => {
                const primary = solution.items?.[0] || null;
                return (
                  <article key={solution.id} className="rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-3xl">
                        <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#A37849]">{solution.eyebrow}</div>
                        <h3 className="mt-1.5 text-[22px] font-medium tracking-[-0.03em] text-[#1C1B19]">{solution.title}</h3>
                        <p className="mt-2 text-[12px] leading-5 text-[#7B7770]">{solution.description}</p>
                      </div>
                      {primary ? (
                        <Link href={primary.href} className="inline-flex items-center gap-2 rounded-xl bg-[#1D1B18] px-4 py-2.5 text-[12px] font-medium text-white">
                          Open control <ArrowRight size={13} />
                        </Link>
                      ) : null}
                    </div>

                    <div className="mt-5 grid gap-x-5 border-t border-black/[0.07] pt-2 sm:grid-cols-2 lg:grid-cols-3">
                      {(solution.items || []).slice(1).map((item) => (
                        <Link key={item.id} href={item.href} className="group flex items-center justify-between gap-3 border-b border-black/[0.06] py-3">
                          <div className="min-w-0">
                            <div className="text-[12px] font-medium text-[#3B3833] group-hover:text-[#8D6338]">{item.label}</div>
                            <div className="mt-0.5 truncate text-[10px] text-[#9A968E]">{item.description}</div>
                          </div>
                          <ArrowRight size={11} className="shrink-0 text-[#B7B3AB]" />
                        </Link>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="mt-5 rounded-[24px] border border-[#D6A66A]/20 bg-white p-5">
            <div className="flex items-start gap-3">
              <LayoutDashboard size={18} className="mt-0.5 text-[#A37849]" />
              <div>
                <div className="text-[13px] font-medium text-[#302D29]">No industry solution is configured</div>
                <div className="mt-1 text-[11px] leading-5 text-[#817D76]">Avantiqo is showing the neutral Operations kernel. Configure an operating solution on the organization to get an industry-native command workspace without changing the core runtime.</div>
              </div>
            </div>
          </section>
        )}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {metricCard("Active work", state.loading ? "…" : Number(metrics.active || 0), "Open operational work")}
          {metricCard("Due today", state.loading ? "…" : Number(metrics.due_today || 0), "Work due today")}
          {metricCard("Overdue", state.loading ? "…" : Number(metrics.overdue || 0), "Past due and still open", true)}
          {metricCard("Unassigned", state.loading ? "…" : Number(metrics.unassigned || 0), "Needs accountable owner", true)}
          {metricCard("Priority", state.loading ? "…" : Number(metrics.high_priority || 0), "High/critical active work", true)}
          {metricCard("Completed", state.loading ? "…" : Number(metrics.completed_today || 0), "Completed today")}
        </section>

        <section className="mt-5 rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
          <div className="flex items-end justify-between gap-4 border-b border-black/[0.07] pb-4">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">Cross-industry attention</div>
              <h2 className="mt-1.5 text-[19px] font-medium tracking-[-0.025em] text-[#1C1B19]">Work that needs intervention</h2>
            </div>
          </div>

          <div className="divide-y divide-black/[0.06]">
            {!state.loading && attention.length === 0 ? (
              <div className="flex items-center gap-3 py-7 text-[12px] text-[#77736C]">
                <CheckCircle2 size={16} className="text-[#718167]" /> No cross-industry work currently needs intervention.
              </div>
            ) : null}
            {attention.slice(0, 8).map((row) => {
              const item = itemsByCapability.get(row.capability_id);
              if (!item) return null;
              return (
                <Link key={row.id} href={itemHref(item)} className="group flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-[#34312D] group-hover:text-[#8D6338]">{row.name || row.code || item.name}</div>
                    <div className="mt-1 text-[10px] text-[#9A968E]">{item.name} · {row.status || "Open"}{row.due_at ? ` · Due ${new Date(row.due_at).toLocaleString()}` : ""}</div>
                  </div>
                  <ArrowRight size={12} className="shrink-0 text-[#B7B3AB]" />
                </Link>
              );
            })}
          </div>
        </section>

        {showManagement ? (
          <section className="mt-5 rounded-[24px] border border-black/[0.075] bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[0.07] pb-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">Neutral Operations kernel</div>
                <h2 className="mt-1.5 text-[19px] font-medium tracking-[-0.025em] text-[#1C1B19]">Specialist execution tools</h2>
                <div className="mt-1 text-[11px] text-[#9A968E]">Industry applications above translate into these governed primitives.</div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-black/[0.07] bg-[#FBFAF8] px-3 py-1.5 text-[9px] text-[#77736C]">
                {readiness.loading ? <RefreshCw size={10} className="animate-spin" /> : readiness.status === "healthy" ? <CheckCircle2 size={10} className="text-[#718167]" /> : <AlertTriangle size={10} className="text-[#A46A4F]" />}
                Runtime {readiness.status || "checking"}
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {authorisedGroups.map((group) => (
                <article key={group.id} className="rounded-2xl border border-black/[0.07] bg-[#FBFAF8] p-3">
                  <div className="px-2 py-1">
                    <div className="text-[12px] font-medium text-[#35322E]">{group.name}</div>
                    <div className="mt-1 text-[10px] leading-4 text-[#96928A]">{group.description}</div>
                  </div>
                  <div className="mt-2 divide-y divide-black/[0.055]">
                    {group.items.map((item) => (
                      <Link key={item.capabilityId} href={itemHref(item)} className="group flex items-center justify-between gap-3 px-2 py-2.5">
                        <span className="truncate text-[11px] text-[#5C5851] group-hover:text-[#8D6338]">{item.name}</span>
                        <ArrowRight size={10} className="shrink-0 text-[#B7B3AB]" />
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            {readiness.status !== "healthy" && !readiness.loading ? (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] p-3 text-[11px] text-[#8B4937]">
                <Wrench size={13} className="mt-0.5 shrink-0" />
                <div>{readiness.blocking_failures?.length || 0} blocking runtime issue(s) and {readiness.warnings?.length || 0} warning(s) need administrator review.</div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
