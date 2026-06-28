"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  Calendar,
  ChevronDown,
  Search,
  Sparkles,
  UserCircle,
} from "lucide-react";

import { useWorkspaceRuntime } from "@/app/providers/WorkspaceRuntimeProvider";
import { getErpDomains } from "@/lib/platform/registry/erpRegistry";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";

function isActive(pathname, organizationId, route) {
  if (!route || !organizationId) return false;

  const href = makeHref(organizationId, route);

  return pathname === href || pathname.startsWith(href + "/");
}

function ContextPill({ icon, label, value }) {
  const Icon = icon;

  if (!value) return null;

  return (
    <button className="flex h-9 min-w-0 max-w-[220px] items-center gap-2 rounded-full border border-white/5 bg-white/[0.018] px-3 text-left text-white/65 transition hover:border-[#D6A66A]/30 hover:bg-[#D6A66A]/10 hover:text-white">
      <Icon size={14} className="shrink-0 text-[#D6A66A]/80" />

      <span className="min-w-0 truncate text-[12px] font-light tracking-[0.02em]">
        {value}
      </span>

      <ChevronDown size={12} className="shrink-0 text-white/25" />
    </button>
  );
}

export default function WorkspaceTopBar() {
  const { runtime, organization, ready } = useWorkspaceRuntime();

  const pathname = usePathname();

  const organizationId =
    organization?.id || runtime?.activeOrganization?.id;

  const companyName =
    organization?.name ||
    runtime?.activeOrganization?.name ||
    "Workspace";

  const entityName =
    runtime?.activeEntity?.name ||
    runtime?.entity?.name ||
    "";

  const periodName =
    runtime?.activePeriod?.name ||
    runtime?.period?.name ||
    "Current Period";

  const userName =
    runtime?.access?.staff?.name ||
    runtime?.access?.staff?.email ||
    "User";

  const domains = getErpDomains();

  if (!ready) {
    return (
      <div className="border-b border-white/10 bg-black px-8 py-4 text-[13px] text-white/50">
        Loading workspace...
      </div>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/92 backdrop-blur-2xl">
      <div className="grid min-h-[58px] grid-cols-[240px_minmax(0,1fr)_220px] items-center gap-4 px-6 py-2 lg:px-8">
        <div className="min-w-0">
          <div className="truncate text-[22px] font-medium uppercase tracking-[0.08em] text-white">
            Avantiqo
          </div>

          <div className="mt-0.5 truncate text-[9px] font-light uppercase tracking-[0.30em] text-white/40">
            Synthetic Intelligence OS
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-center gap-3">
          <ContextPill
            icon={Building2}
            label="Company"
            value={companyName}
          />

          {entityName && entityName !== companyName && (
            <ContextPill
              icon={Building2}
              label="Entity"
              value={entityName}
            />
          )}

          <ContextPill
            icon={Calendar}
            label="Period"
            value={periodName}
          />

          <div className="hidden h-9 w-full max-w-[520px] items-center rounded-full border border-white/5 bg-white/[0.018] px-4 text-white/35 xl:flex">
            <Search size={14} />

            <span className="ml-3 truncate text-[12px] font-light tracking-[0.02em]">
              Search anything...
            </span>
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2 text-white/60">
          <button className="flex h-9 w-9 items-center justify-center rounded-full border border-white/5 bg-white/[0.018] transition hover:border-[#D6A66A]/35 hover:bg-[#D6A66A]/10 hover:text-white">
            <Sparkles size={16} />
          </button>

          <button className="flex h-9 w-9 items-center justify-center rounded-full border border-white/5 bg-white/[0.018] transition hover:border-[#D6A66A]/35 hover:bg-[#D6A66A]/10 hover:text-white">
            <Bell size={16} />
          </button>

          <div className="flex h-9 max-w-[150px] items-center gap-2 rounded-full border border-white/5 bg-white/[0.018] px-3 text-[12px] font-light text-white/65">
            <UserCircle size={16} className="shrink-0" />

            <span className="truncate">
              {userName}
            </span>
          </div>
        </div>
      </div>

      <nav className="flex min-h-[42px] items-center gap-2 overflow-x-auto border-t border-white/5 px-6 py-2 lg:px-8">
        {domains.map((domain) => {
          const href = resolveWorkspaceRoute({
            organizationId,
            moduleId: domain.id,
            route: domain.route,
          });

          const active =
            pathname === href ||
            pathname.startsWith(href + "/");

          return (
            <Link
              key={domain.id}
              href={resolveWorkspaceRoute({
                organizationId,
                moduleId: domain.id,
                route: domain.route,
              })}
              title={domain.description}
              className={
                active
                  ? "whitespace-nowrap rounded-full border border-[#D6A66A]/25 bg-[#D6A66A]/10 px-4 py-1.5 text-[12px] font-light uppercase tracking-[0.08em] text-[#D6A66A]"
                  : "whitespace-nowrap rounded-full border border-white/5 bg-white/[0.012] px-4 py-1.5 text-[12px] font-light uppercase tracking-[0.08em] text-white/50 transition hover:border-white/15 hover:bg-white/[0.045] hover:text-white"
              }
            >
              {domain.name}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
