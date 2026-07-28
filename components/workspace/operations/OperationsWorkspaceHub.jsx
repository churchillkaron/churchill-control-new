"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Search, Wrench } from "lucide-react";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { getOperationsWorkspaceGroups } from "@/lib/operations/registry/OperationsWorkspaceResolver";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";
import {
  hasOperationsPermission,
  OPERATIONS_ACTIONS,
} from "@/lib/operations/security/OperationsAuthorizationPolicy";

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
  const organizationId = params?.organizationId || null;
  const permissions = businessContext.permissions
    || businessContext.access?.permissions
    || [];
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const groups = useMemo(() => (
    getOperationsWorkspaceGroups()
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => (
          hasOperationsPermission({
            permissions,
            capabilityId: item.capabilityId,
            action: item.readOnly
              ? OPERATIONS_ACTIONS.AUDIT
              : OPERATIONS_ACTIONS.VIEW,
          })
          && matchesQuery(group, item, normalizedQuery)
        )),
      }))
      .filter((group) => group.items.length > 0)
  ), [normalizedQuery, permissions]);

  const totalCapabilities = groups.reduce(
    (sum, group) => sum + group.items.length,
    0,
  );

  return (
    <main className="min-h-screen px-6 py-7 text-white">
      <div className="mx-auto max-w-[1540px]">
        <WorkspaceHeader
          workspace="Operations"
          title="Operations"
          description="Industry-neutral work execution, planning, orchestration, control, resilience, quality, performance and operational intelligence."
        />

        <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">
              Canonical Operations Kernel
            </div>
            <div className="mt-2 text-sm text-white/45">
              {totalCapabilities} authorised capabilities across {groups.length} operational groups
            </div>
          </div>

          <div className="flex w-full items-center rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white/45 md:w-[380px]">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Operations capabilities…"
              className="ml-3 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
            />
          </div>
        </section>

        {groups.length === 0 ? (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-8 text-sm text-white/45">
            No authorised Operations capabilities match this search.
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
