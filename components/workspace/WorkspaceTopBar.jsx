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

function makeHref(organizationId, route) {
  if (!organizationId || !route) return "#";

  const clean = String(route).startsWith("/")
    ? String(route)
    : `/${route}`;

  return `/workspace/${organizationId}${clean}`;
}

function isActive(pathname, organizationId, route) {
  if (!route || !organizationId) return false;

  const href = makeHref(organizationId, route);

  return pathname === href || pathname.startsWith(href + "/");
}

function ContextPill({
  icon,
  label,
  value,
  compact = false,
}) {
  const Icon = icon;

  if (!value) return null;

  return (
    <button className="flex max-w-[220px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-left text-white/70 transition hover:border-[#D6A66A]/35 hover:bg-[#D6A66A]/10 hover:text-white">
      <Icon
        size={15}
        className="shrink-0 text-[#D6A66A]"
      />
      <span className="min-w-0">
        {!compact && (
          <span className="block text-[9px] uppercase tracking-[0.22em] text-white/35">
            {label}
          </span>
        )}
        <span className="block truncate text-xs font-medium">
          {value}
        </span>
      </span>
      <ChevronDown
        size={13}
        className="shrink-0 text-white/30"
      />
    </button>
  );
}

export default function WorkspaceTopBar() {
  const {
    runtime,
    organization,
    ready,
  } = useWorkspaceRuntime();

  const pathname = usePathname();

  const organizationId =
    organization?.id ||
    runtime?.activeOrganization?.id;

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
      <div className="border-b border-white/10 bg-black px-8 py-4 text-sm text-white/50">
        Loading workspace...
      </div>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/92 backdrop-blur-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3 lg:px-8">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="mr-2 min-w-[190px]">
            <div className="truncate text-lg font-semibold tracking-[-0.03em] text-white">
              Avantiqo
            </div>
            <div className="mt-0.5 text-[9px] uppercase tracking-[0.28em] text-[#D6A66A]/75">
              Business Operating System
            </div>
          </div>

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
            compact={!entityName}
          />
        </div>

        <div className="hidden min-w-[280px] flex-1 items-center rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-white/40 xl:flex">
          <Search size={15} />
          <span className="ml-3 truncate text-sm">
            Search customers, invoices, orders, inventory, projects, documents...
          </span>
        </div>

        <div className="flex items-center gap-2 text-white/60">
          <button className="rounded-full border border-white/10 bg-white/[0.03] p-2 transition hover:border-[#D6A66A]/35 hover:bg-[#D6A66A]/10 hover:text-white">
            <Sparkles size={17} />
          </button>

          <button className="rounded-full border border-white/10 bg-white/[0.03] p-2 transition hover:border-[#D6A66A]/35 hover:bg-[#D6A66A]/10 hover:text-white">
            <Bell size={17} />
          </button>

          <div className="flex max-w-[190px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
            <UserCircle size={17} />
            <span className="truncate">
              {userName}
            </span>
          </div>
        </div>
      </div>

      <nav className="flex items-center gap-2 overflow-x-auto border-t border-white/5 px-6 py-3 lg:px-8">
        {domains.map((domain) => {
          const active =
            isActive(
              pathname,
              organizationId,
              domain.route
            ) ||
            (domain.id === "home" &&
              pathname.includes("/dashboard"));

          return (
            <Link
              key={domain.id}
              href={makeHref(
                organizationId,
                domain.route
              )}
              className={
                active
                  ? "whitespace-nowrap rounded-full border border-[#D6A66A]/55 bg-[#D6A66A]/15 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#D6A66A]"
                  : "whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
              }
              title={domain.description}
            >
              {domain.name}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
