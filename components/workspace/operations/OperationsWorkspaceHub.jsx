"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
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

export default function OperationsWorkspaceHub() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId = params?.organizationId || businessContext.organization_id || null;
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const access = useOperationsAccess({ organizationId, entityId, periodId });
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

  const groups = useMemo(() => authorisedGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => matchesQuery(group, item, normalizedQuery)),
    }))
    .filter((group) => group.items.length > 0), [authorisedGroups, normalizedQuery]);

  const totalAuthorisedCapabilities = authorisedGroups.reduce(
    (sum, group) => sum + group.items.length,
    0,
  );
  const visibleCapabilities = groups.reduce(
    (sum, group) => sum + group.items.length,
    0,
  );
  const queryHasNoMatches = !access.loading
    && !access.error
    && totalAuthorisedCapabilities > 0
    && visibleCapabilities === 0;
  const genuinelyHasNoAccess = !access.loading
    && !access.error
    && totalAuthorisedCapabilities === 0;

  return (
    <main className="min-h-screen px-6 py-7 text-white">
      <div className="mx-auto max-w-[1540px]">
        <WorkspaceHeader
          workspace="Operations"
          title="Operations"
          description="Industry-neutral work execution, planning, orchestration, control, resilience, quality, performance and operational intelligence."
          actions={access.can?.administer ? (
            <Link
              href={`/workspace/${organizationId}/operations/access-control`}
              className="inline-flex items-center gap-2 rounded-xl border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-4 py-2 text-sm text-[#D6A66A]"
            >
              <ShieldCheck size={15} /> Access Control
            </Link>
          ) : null}
        />

        <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">
              Canonical Operations Kernel
            </div>
            <div className="mt-2 text-sm text-white/45">
              {access.loading
                ? "Resolving Operations access…"
                : access.error
                  ? "Operations access could not be resolved"
                  : `${totalAuthorisedCapabilities} authorised capabilities across ${authorisedGroups.length} operational groups`}
            </div>
          </div>

          <div className="flex w-full items-center rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white/45 md:w-[380px]">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={access.loading || Boolean(access.error)}
              placeholder="Search Operations capabilities…"
              className="ml-3 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30 disabled:opacity-45"
            />
          </div>
        </section>

        {access.loading ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.035] p-8 text-sm text-white/45">
            <LoaderCircle className="mr-3 animate-spin text-[#D6A66A]" size={20} />
            Resolving your Operations capabilities…
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
                <div className="mt-2 text-sm leading-6 text-white/45">
                  Your organisation membership is active, but it does not currently grant an Operations role. Ask an Operations administrator to assign the appropriate access bundle.
                </div>
              </div>
            </div>
          </div>
        ) : queryHasNoMatches ? (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-8 text-sm text-white/45">
            No authorised Operations capabilities match “{query}”.
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section
                key={group.id}
                className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 shadow-xl shadow-black/10"
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white">{group.name}</h2>
                    <p className="mt-1 text-sm leading-6 text-white/42">{group.description}</p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/35">
                    {group.items.length}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((item) => (
                    <Link
                      key={item.capabilityId}
                      href={resolveWorkspaceRoute({
                        organizationId,
                        workspaceId: "operations",
                        moduleId: item.capabilityId,
                        route: item.route,
                      })}
                      className="group rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-[#D6A66A]/40 hover:bg-[#D6A66A]/10"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="rounded-2xl border border-white/10 bg-black/30 p-2.5 text-[#D6A66A]">
                          <Wrench size={19} />
                        </div>
                        <ArrowRight
                          size={17}
                          className="mt-2 text-white/22 transition group-hover:translate-x-1 group-hover:text-[#D6A66A]"
                        />
                      </div>

                      <div className="mt-4 text-sm font-semibold text-white">{item.name}</div>
                      <div className="mt-1.5 text-xs leading-5 text-white/40">{item.description}</div>

                      <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-white/30">
                        <span className="rounded-full border border-white/10 px-2.5 py-1">{item.lifecycle}</span>
                        <span className="rounded-full border border-white/10 px-2.5 py-1">{item.recordType}</span>
                        {item.readOnly ? (
                          <span className="rounded-full border border-white/10 px-2.5 py-1">Read only</span>
                        ) : null}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
