"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Building2,
  Calendar,
  CreditCard,
  ChevronDown,
  Globe2,
  Search,
  Sparkles,
  UserCircle,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import {
  getErpDomains,
  getPlatformBrand,
  getPlatformHeaderItems,
} from "@/lib/platform/registry/erpRegistry";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";

const ICONS = {
  CreditCard,
  Bell,
  Globe2,
  Search,
  Sparkles,
  UserCircle,
};

function platformHref(organizationId, route) {
  if (!route) return "#";
  if (!organizationId) return route;

  return resolveWorkspaceRoute({
    organizationId,
    moduleId: route.replace("/", "") || "home",
    route,
  });
}

function ContextPill({ icon, value }) {
  const Icon = icon;

  if (!value) return null;

  return (
    <div className="flex h-9 min-w-0 max-w-[220px] items-center gap-2 rounded-full border border-white/5 bg-white/[0.018] px-3 text-left text-white/65">
      <Icon size={14} className="shrink-0 text-[#D6A66A]/80" />
      <span className="min-w-0 truncate text-[12px] font-light tracking-[0.02em]">
        {value}
      </span>
    </div>
  );
}

function OrganizationSelector({ organization, organizations, pathname }) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  const available = Array.isArray(organizations)
    ? organizations.filter((row) => row?.id && row?.name)
    : [];

  async function switchOrganization(nextOrganization) {
    if (!nextOrganization?.id || nextOrganization.id === organization?.id) {
      setOpen(false);
      return;
    }

    try {
      setSwitching(true);
      setError("");

      const response = await fetch("/api/session/organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ organizationId: nextOrganization.id }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to switch organization");
      }

      const workspaceMatch = pathname?.match(/^\/workspace\/([^/]+)(.*)$/);

      if (workspaceMatch) {
        window.location.assign(
          `/workspace/${encodeURIComponent(nextOrganization.id)}${workspaceMatch[2] || ""}`
        );
        return;
      }

      window.location.reload();
    } catch (switchError) {
      setError(switchError.message || "Unable to switch organization");
      setSwitching(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={switching || available.length < 2}
        className="flex h-9 min-w-0 max-w-[240px] items-center gap-2 rounded-full border border-white/5 bg-white/[0.018] px-3 text-left text-white/65 transition hover:border-[#D6A66A]/30 hover:bg-[#D6A66A]/10 hover:text-white disabled:cursor-default"
      >
        <Building2 size={14} className="shrink-0 text-[#D6A66A]/80" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-light tracking-[0.02em]">
          {switching ? "Switching..." : organization?.name || "Workspace"}
        </span>
        {available.length > 1 && (
          <ChevronDown size={12} className="shrink-0 text-white/25" />
        )}
      </button>

      {open && available.length > 1 && (
        <div className="absolute left-0 top-11 z-[90] w-[320px] overflow-hidden rounded-2xl border border-[#D6A66A]/25 bg-[#050505] p-2 shadow-[0_28px_90px_rgba(0,0,0,.95),0_0_0_1px_rgba(255,255,255,.03)]">
          <div className="border-b border-white/[0.06] px-3 pb-3 pt-2 text-[9px] uppercase tracking-[0.22em] text-[#D6A66A]/65">
            Select organization
          </div>

          <div className="mt-1 max-h-[360px] overflow-y-auto bg-[#050505]">
            {available.map((item) => {
              const active = item.id === organization?.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => switchOrganization(item)}
                  className={
                    active
                      ? "flex w-full items-center gap-3 rounded-xl border border-[#D6A66A]/35 bg-[#18130C] px-3 py-3 text-left text-[#F0D29A] shadow-[inset_0_0_0_1px_rgba(214,166,106,.04)]"
                      : "flex w-full items-center gap-3 rounded-xl border border-transparent bg-[#050505] px-3 py-3 text-left text-white/75 transition hover:border-white/10 hover:bg-[#121212] hover:text-white"
                  }
                >
                  <Building2
                    size={14}
                    className={active ? "shrink-0 text-[#D6A66A]" : "shrink-0 text-white/45"}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px]">
                    {item.name}
                  </span>
                  {active && (
                    <span className="rounded-full border border-[#D6A66A]/25 bg-[#D6A66A]/10 px-2 py-0.5 text-[8px] uppercase tracking-[0.12em] text-[#E7C991]">
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {error && (
            <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-[11px] text-red-300">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HeaderItem({ item, organizationId, userName }) {
  const Icon = ICONS[item.icon] || Search;

  if (item.type === "search") {
    return (
      <Link
        href={platformHref(organizationId, item.route)}
        title={item.name}
        className="hidden h-9 w-full max-w-[520px] items-center rounded-full border border-white/5 bg-white/[0.018] px-4 text-white/35 transition hover:border-[#D6A66A]/35 hover:bg-[#D6A66A]/10 hover:text-white xl:flex"
      >
        <Icon size={14} />
        <span className="ml-3 truncate text-[12px] font-light tracking-[0.02em]">
          Search anything...
        </span>
      </Link>
    );
  }

  if (item.type === "user") {
    return (
      <Link
        href={platformHref(organizationId, item.route)}
        title={item.name}
        className="flex h-9 max-w-[150px] items-center gap-2 rounded-full border border-white/5 bg-white/[0.018] px-3 text-[12px] font-light text-white/65 transition hover:border-[#D6A66A]/35 hover:bg-[#D6A66A]/10 hover:text-white"
      >
        <Icon size={16} className="shrink-0" />
        <span className="truncate">{userName}</span>
      </Link>
    );
  }

  if (item.id === "network" || item.id === "services") {
    return (
      <Link
        href={platformHref(organizationId, item.route)}
        title={item.name}
        className="flex h-9 items-center gap-2 rounded-full border border-white/5 bg-white/[0.018] px-3 text-[12px] font-light uppercase tracking-[0.08em] text-white/60 transition hover:border-[#D6A66A]/35 hover:bg-[#D6A66A]/10 hover:text-white"
      >
        <Icon size={15} />
        <span className="hidden 2xl:inline">{item.name}</span>
      </Link>
    );
  }

  return (
    <Link
      href={platformHref(organizationId, item.route)}
      title={item.name}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/5 bg-white/[0.018] text-white/60 transition hover:border-[#D6A66A]/35 hover:bg-[#D6A66A]/10 hover:text-white"
    >
      <Icon size={16} />
    </Link>
  );
}

export default function WorkspaceTopBar() {
  const businessContext = useBusinessContext();
  const params = useParams();
  const pathname = usePathname();

  const ready = businessContext?.ready || false;
  const organization = businessContext?.organization || null;
  const organizations = businessContext?.organizations || [];
  const entity = businessContext?.entity || null;
  const period = businessContext?.period || null;
  const staff = businessContext?.staff || null;

  const organizationId =
    businessContext?.organization_id ||
    organization?.id ||
    params?.organizationId ||
    null;

  const entityName = entity?.name || entity?.legal_name || "";
  const periodName = period?.name || period?.period_name || "Current Period";
  const userName = staff?.name || staff?.email || "User";

  const brand = getPlatformBrand();
  const domains = getErpDomains();
  const headerItems = getPlatformHeaderItems();

  if (!ready) {
    return (
      <div className="border-b border-white/10 bg-black px-8 py-4 text-[13px] text-white/50">
        Loading workspace...
      </div>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/92 backdrop-blur-2xl">
      <div className="grid min-h-[58px] grid-cols-[240px_minmax(0,1fr)_minmax(260px,auto)] items-center gap-4 px-6 py-2 lg:px-8">
        <div className="min-w-0">
          <div className="truncate text-[22px] font-medium uppercase tracking-[0.08em] text-white">
            {brand.name}
          </div>
          <div className="mt-0.5 truncate text-[9px] font-light uppercase tracking-[0.30em] text-white/40">
            {brand.subtitle}
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-center gap-3">
          <OrganizationSelector
            organization={organization}
            organizations={organizations}
            pathname={pathname}
          />

          {entityName && entityName !== organization?.name && (
            <ContextPill icon={Building2} value={entityName} />
          )}

          <ContextPill icon={Calendar} value={periodName} />

          {headerItems
            .filter((item) => item.type === "search")
            .map((item) => (
              <HeaderItem
                key={item.id}
                item={item}
                organizationId={organizationId}
                userName={userName}
              />
            ))}
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          {headerItems
            .filter((item) => item.type !== "search")
            .map((item) => (
              <HeaderItem
                key={item.id}
                item={item}
                organizationId={organizationId}
                userName={userName}
              />
            ))}
        </div>
      </div>

      <nav className="flex min-h-[42px] items-center gap-2 overflow-x-auto border-t border-white/5 px-6 py-2 lg:px-8">
        {domains.map((domain) => {
          const href = resolveWorkspaceRoute({
            organizationId,
            moduleId: domain.id,
            route: domain.route,
          });

          const active = pathname === href || pathname.startsWith(href + "/");

          return (
            <Link
              key={domain.id}
              href={href}
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
