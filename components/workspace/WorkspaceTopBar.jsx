"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Bell,
  Building2,
  Calendar,
  ChevronDown,
  Command,
  CreditCard,
  Globe2,
  Grid2X2,
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

const PLATFORM_ADMIN_ROLES = new Set(["PLATFORM_OWNER", "SUPER_ADMIN"]);
const PLATFORM_ONLY_HEADER_ITEMS = new Set(["ai"]);

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function platformHref(organizationId, route) {
  if (!route) return "#";
  if (!organizationId) return route;

  return resolveWorkspaceRoute({
    organizationId,
    moduleId: route.replace("/", "") || "home",
    route,
  });
}

function openUniversalOperator() {
  const homeInput = document.querySelector('[data-avantiqo-home-input="true"]');
  if (homeInput instanceof HTMLElement) {
    homeInput.focus();
    homeInput.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const operatorButton = document.querySelector(
    'button[aria-label="Open Avantiqo Operator"]',
  );
  if (operatorButton instanceof HTMLElement) operatorButton.click();
}

function formatPeriodMonthYear(period) {
  const source = text(
    period?.start_date || period?.period_start || period?.date_from,
  );
  if (source) {
    const date = new Date(`${source.slice(0, 10)}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
    }
  }

  return text(period?.name || period?.period_name || period?.label) || "Select period";
}

function exactPeriodLabel(period) {
  const explicit = text(period?.name || period?.period_name || period?.label);
  if (explicit) return explicit;

  const start = text(period?.start_date || period?.period_start || period?.date_from);
  const end = text(period?.end_date || period?.period_end || period?.date_to);
  if (start && end) return `${start.slice(0, 10)} – ${end.slice(0, 10)}`;
  return formatPeriodMonthYear(period);
}

function periodMeta(period) {
  const status = upper(period?.status) || "UNKNOWN";
  const start = text(period?.start_date || period?.period_start || period?.date_from);
  const end = text(period?.end_date || period?.period_end || period?.date_to);
  const dates = [start && start.slice(0, 10), end && end.slice(0, 10)]
    .filter(Boolean)
    .join(" – ");
  return [status, dates].filter(Boolean).join(" · ");
}

function SelectorMenu({ title, items, activeId, onSelect, getLabel, getMeta }) {
  return (
    <div className="absolute left-0 top-11 z-[90] w-[330px] overflow-hidden rounded-2xl border border-black/[0.08] bg-white p-2 shadow-[0_20px_60px_rgba(34,30,24,0.16)]">
      <div className="border-b border-black/[0.06] px-3 pb-2.5 pt-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#9A744B]">
        {title}
      </div>
      <div className="mt-1 max-h-[360px] overflow-y-auto">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={
                active
                  ? "flex w-full items-center gap-3 rounded-xl bg-[#F4EFE8] px-3 py-3 text-left text-[#76522F]"
                  : "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[#4D4A45] transition hover:bg-[#F7F6F3]"
              }
            >
              <Building2 size={14} className={active ? "shrink-0 text-[#A37849]" : "shrink-0 text-[#918D85]"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium">{getLabel(item)}</span>
                {getMeta ? (
                  <span className="mt-0.5 block truncate text-[9px] uppercase tracking-[0.1em] text-[#A7A39B]">
                    {getMeta(item)}
                  </span>
                ) : null}
              </span>
              {active ? (
                <span className="rounded-full border border-[#D6A66A]/25 bg-[#D6A66A]/10 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#966B3F]">
                  Active
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OrganizationSelector({ organization, organizations, pathname }) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const available = Array.isArray(organizations)
    ? organizations.filter((row) => row?.id && row?.name)
    : [];

  async function switchOrganization(nextOrganization) {
    if (!nextOrganization?.id || nextOrganization.id === organization?.id) {
      setOpen(false);
      return;
    }

    setSwitching(true);
    try {
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
        window.location.assign(`/workspace/${encodeURIComponent(nextOrganization.id)}${workspaceMatch[2] || ""}`);
        return;
      }
      window.location.reload();
    } finally {
      setSwitching(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={switching || available.length < 2}
        className="flex h-9 min-w-0 max-w-[210px] items-center gap-2 rounded-xl border border-black/[0.07] bg-[#FBFAF8] px-3 text-left text-[#5E5A54] transition hover:border-[#D6A66A]/45 hover:bg-white disabled:cursor-default"
      >
        <Building2 size={13} className="shrink-0 text-[#A37849]" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
          {switching ? "Switching..." : organization?.name || "Workspace"}
        </span>
        {available.length > 1 ? <ChevronDown size={11} className="shrink-0 text-[#AAA69E]" /> : null}
      </button>
      {open && available.length > 1 ? (
        <SelectorMenu
          title="Organization"
          items={available}
          activeId={organization?.id}
          onSelect={switchOrganization}
          getLabel={(item) => item.name}
        />
      ) : null}
    </div>
  );
}

function EntitySelector({ entity, entities }) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const available = Array.isArray(entities)
    ? entities.filter((row) => row?.id && row?.is_active !== false)
    : [];
  const label = entity?.display_name || entity?.legal_name || entity?.name || entity?.code || "Entity";

  async function switchEntity(nextEntity) {
    if (!nextEntity?.id || nextEntity.id === entity?.id) {
      setOpen(false);
      return;
    }

    setSwitching(true);
    try {
      const response = await fetch("/api/session/entity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ entityId: nextEntity.id }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to switch legal entity");
      }
      window.location.reload();
    } finally {
      setSwitching(false);
      setOpen(false);
    }
  }

  if (!entity || !available.length) return null;

  return (
    <div className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={switching || available.length < 2}
        className="flex h-9 min-w-0 max-w-[190px] items-center gap-2 rounded-xl border border-black/[0.07] bg-[#FBFAF8] px-3 text-left text-[#5E5A54] transition hover:border-[#D6A66A]/45 hover:bg-white disabled:cursor-default"
      >
        <Building2 size={13} className="shrink-0 text-[#A37849]" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
          {switching ? "Switching..." : label}
        </span>
        {available.length > 1 ? <ChevronDown size={11} className="shrink-0 text-[#AAA69E]" /> : null}
      </button>
      {open && available.length > 1 ? (
        <SelectorMenu
          title="Legal entity"
          items={available}
          activeId={entity?.id}
          onSelect={switchEntity}
          getLabel={(item) => item.display_name || item.legal_name || item.name || item.code || item.id}
          getMeta={(item) => [item.code, item.country, item.currency].filter(Boolean).join(" · ")}
        />
      ) : null}
    </div>
  );
}

function PeriodSelector({ organizationId, entity, period }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [periods, setPeriods] = useState([]);
  const [error, setError] = useState("");
  const fiscalPeriodsHref = organizationId
    ? `/workspace/${encodeURIComponent(organizationId)}/finance/fiscal-periods`
    : "#";

  async function loadPeriods() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId });
      if (entity?.id) query.set("entityId", entity.id);
      const response = await fetch(`/api/session/period?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load accounting periods");
      }
      setPeriods(Array.isArray(result.periods) ? result.periods : []);
    } catch (loadError) {
      setPeriods([]);
      setError(loadError?.message || "Unable to load accounting periods");
    } finally {
      setLoading(false);
    }
  }

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) await loadPeriods();
  }

  async function switchPeriod(nextPeriod) {
    if (!nextPeriod?.id || nextPeriod.id === period?.id) {
      setOpen(false);
      return;
    }

    setSwitching(true);
    setError("");
    try {
      const response = await fetch("/api/session/period", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          organizationId,
          entityId: entity?.id || null,
          periodId: nextPeriod.id,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to switch accounting period");
      }
      window.location.reload();
    } catch (switchError) {
      setError(switchError?.message || "Unable to switch accounting period");
      setSwitching(false);
    }
  }

  return (
    <div className="relative hidden xl:block">
      <button
        type="button"
        onClick={toggleOpen}
        disabled={switching || !organizationId}
        className="flex h-9 min-w-[150px] max-w-[190px] items-center gap-2 rounded-xl border border-black/[0.07] bg-[#FBFAF8] px-3 text-left text-[#5E5A54] transition hover:border-[#D6A66A]/45 hover:bg-white disabled:cursor-default"
        title="Accounting period"
      >
        <Calendar size={13} className="shrink-0 text-[#A37849]" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
          {switching ? "Switching..." : formatPeriodMonthYear(period)}
        </span>
        <ChevronDown size={11} className="shrink-0 text-[#AAA69E]" />
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-[90] w-[360px] overflow-hidden rounded-2xl border border-black/[0.08] bg-white p-2 shadow-[0_20px_60px_rgba(34,30,24,0.16)]">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-3 pb-2.5 pt-2">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#9A744B]">
                Accounting period
              </div>
              <div className="mt-1 text-[10px] text-[#9A968E]">
                Switch context without using Intelligence
              </div>
            </div>
            {period?.status ? (
              <span className="rounded-full border border-black/[0.07] bg-[#F7F6F3] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#77736C]">
                {upper(period.status)}
              </span>
            ) : null}
          </div>

          <div className="mt-1 max-h-[330px] overflow-y-auto">
            {loading ? (
              <div className="px-3 py-4 text-[11px] text-[#8B8881]">Loading periods...</div>
            ) : error ? (
              <div className="px-3 py-4 text-[11px] leading-5 text-[#A05F55]">{error}</div>
            ) : periods.length ? (
              periods.map((item) => {
                const active = item.id === period?.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => switchPeriod(item)}
                    className={
                      active
                        ? "flex w-full items-center gap-3 rounded-xl bg-[#F4EFE8] px-3 py-3 text-left text-[#76522F]"
                        : "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[#4D4A45] transition hover:bg-[#F7F6F3]"
                    }
                  >
                    <Calendar size={14} className={active ? "shrink-0 text-[#A37849]" : "shrink-0 text-[#918D85]"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium">{exactPeriodLabel(item)}</span>
                      <span className="mt-0.5 block truncate text-[9px] uppercase tracking-[0.08em] text-[#A7A39B]">
                        {periodMeta(item)}
                      </span>
                    </span>
                    {active ? (
                      <span className="rounded-full border border-[#D6A66A]/25 bg-[#D6A66A]/10 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#966B3F]">
                        Active
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-4 text-[11px] text-[#8B8881]">No accounting periods are configured.</div>
            )}
          </div>

          <div className="mt-1 grid grid-cols-2 gap-2 border-t border-black/[0.06] p-2 pt-3">
            <Link
              href={fiscalPeriodsHref}
              onClick={() => setOpen(false)}
              className="rounded-xl border border-black/[0.07] bg-[#F7F6F3] px-3 py-2.5 text-center text-[10px] font-medium text-[#5F5B55] transition hover:bg-[#F1EFEA]"
            >
              Manage periods
            </Link>
            <Link
              href={fiscalPeriodsHref}
              onClick={() => setOpen(false)}
              className="rounded-xl bg-[#171716] px-3 py-2.5 text-center text-[10px] font-medium text-white transition hover:bg-black"
            >
              Open new period
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HeaderAction({ item, organizationId, userName }) {
  const Icon = ICONS[item.icon] || Search;

  if (item.type === "search") return null;

  if (item.type === "user") {
    return (
      <Link
        href={platformHref(organizationId, item.route)}
        title={item.name}
        className="flex h-9 max-w-[150px] items-center gap-2 rounded-xl border border-black/[0.07] bg-white px-3 text-[11px] font-medium text-[#5E5A54] transition hover:border-[#D6A66A]/40 hover:text-[#7A5633]"
      >
        <Icon size={15} className="shrink-0" />
        <span className="hidden truncate xl:inline">{userName}</span>
      </Link>
    );
  }

  return (
    <Link
      href={platformHref(organizationId, item.route)}
      title={item.name}
      aria-label={item.name}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.07] bg-white text-[#716D66] transition hover:border-[#D6A66A]/40 hover:bg-[#FBF7F1] hover:text-[#8D643C]"
    >
      <Icon size={15} />
    </Link>
  );
}

export default function WorkspaceTopBar() {
  const businessContext = useBusinessContext();
  const params = useParams();
  const pathname = usePathname();
  const [areasOpen, setAreasOpen] = useState(false);
  const ready = businessContext?.ready || false;
  const organization = businessContext?.organization || null;
  const organizations = businessContext?.organizations || [];
  const entity = businessContext?.entity || null;
  const entities = businessContext?.entities || [];
  const period = businessContext?.period || null;
  const staff = businessContext?.staff || null;
  const role = upper(businessContext?.role || staff?.role);
  const isPlatformOperatorWorkspace = businessContext?.is_platform_operator_workspace === true;
  const canAccessPlatformInfrastructure = isPlatformOperatorWorkspace && PLATFORM_ADMIN_ROLES.has(role);
  const organizationId = businessContext?.organization_id || organization?.id || params?.organizationId || null;
  const userName = staff?.name || staff?.display_name || staff?.email || "User";
  const brand = getPlatformBrand();
  const headerItems = getPlatformHeaderItems().filter(
    (item) => !PLATFORM_ONLY_HEADER_ITEMS.has(item.id) || canAccessPlatformInfrastructure,
  );

  const domains = useMemo(() => getErpDomains()
    .filter((domain) => domain.id !== "services")
    .map((domain) => ({
      ...domain,
      href: resolveWorkspaceRoute({
        organizationId,
        moduleId: domain.id,
        route: domain.route,
      }),
    }))
    .filter((domain) => domain.href && domain.href !== "#"), [organizationId]);

  if (!ready) {
    return (
      <div className="h-[61px] border-b border-black/[0.07] bg-white px-6 py-5 text-[11px] text-[#8B8881]">
        Loading workspace...
      </div>
    );
  }

  return (
    <header className="sticky top-0 z-50 h-[61px] border-b border-black/[0.07] bg-white/95 backdrop-blur-xl">
      <div className="grid h-full grid-cols-[minmax(150px,210px)_minmax(0,1fr)_auto] items-center gap-3 px-4 md:px-5 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/workspace/${encodeURIComponent(organizationId)}`}
            className="flex min-w-0 items-center gap-2.5"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#171716] text-[9px] font-bold uppercase tracking-[0.08em] text-white">
              AV
            </div>
            <div className="min-w-0">
              <div className="truncate text-[16px] font-semibold uppercase tracking-[0.08em] text-[#1B1A18]">
                {brand.name}
              </div>
              <div className="mt-0.5 hidden truncate text-[8px] font-medium uppercase tracking-[0.2em] text-[#A09C94] xl:block">
                {brand.subtitle}
              </div>
            </div>
          </Link>

          <div className="relative lg:hidden">
            <button
              type="button"
              onClick={() => setAreasOpen((value) => !value)}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-black/[0.07] bg-[#FBFAF8] px-2.5 text-[10px] font-medium text-[#69655F]"
            >
              <Grid2X2 size={13} /> Areas
            </button>
            {areasOpen ? (
              <div className="absolute left-0 top-11 z-[90] w-[260px] rounded-2xl border border-black/[0.08] bg-white p-2 shadow-[0_20px_60px_rgba(34,30,24,0.16)]">
                {domains.map((domain) => (
                  <Link
                    key={domain.id}
                    href={domain.href}
                    onClick={() => setAreasOpen(false)}
                    className="block rounded-xl px-3 py-2.5 text-[12px] font-medium text-[#514E49] transition hover:bg-[#F7F6F3]"
                  >
                    {domain.name}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-center gap-2">
          <button
            type="button"
            onClick={openUniversalOperator}
            className="group flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-black/[0.08] bg-[#F7F6F3] px-3 text-left transition hover:border-[#D6A66A]/45 hover:bg-[#FBF8F3] sm:max-w-[430px]"
          >
            <Search size={14} className="shrink-0 text-[#8F8A82] group-hover:text-[#9A744B]" />
            <span className="min-w-0 flex-1 truncate text-[11px] text-[#8B8881]">
              Ask, search or do anything...
            </span>
            <span className="hidden items-center gap-0.5 rounded-md border border-black/[0.07] bg-white px-1.5 py-0.5 text-[9px] font-medium text-[#AAA69E] md:flex">
              <Command size={9} />K
            </span>
          </button>

          <OrganizationSelector
            organization={organization}
            organizations={organizations}
            pathname={pathname}
          />
          <EntitySelector entity={entity} entities={entities} />
          <PeriodSelector
            organizationId={organizationId}
            entity={entity}
            period={period}
          />
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={openUniversalOperator}
            title="Avantiqo Intelligence"
            aria-label="Avantiqo Intelligence"
            className="flex h-9 items-center gap-2 rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] px-2.5 text-[#8D643C] transition hover:bg-[#D6A66A]/[0.14]"
          >
            <Sparkles size={15} />
            <span className="hidden text-[10px] font-semibold xl:inline">Intelligence</span>
          </button>

          {headerItems
            .filter((item) => item.type !== "search")
            .map((item) => (
              <HeaderAction
                key={item.id}
                item={item}
                organizationId={organizationId}
                userName={userName}
              />
            ))}
        </div>
      </div>
    </header>
  );
}
