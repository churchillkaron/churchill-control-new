"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Boxes,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  FileText,
  Files,
  FolderKanban,
  Handshake,
  Home,
  Landmark,
  LayoutGrid,
  Palette,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { getErpDomains } from "@/lib/platform/registry/erpRegistry";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";

const NAV_EXPANDED_KEY = "avantiqo.erp.navigation.expanded.v1";

const DOMAIN_ICONS = {
  finance: Landmark,
  operations: Activity,
  "supply-chain": Boxes,
  supply_chain: Boxes,
  commercial: Handshake,
  people: Users,
  projects: FolderKanban,
  documents: Files,
  analytics: ChartNoAxesCombined,
  creative: Palette,
  compliance: ShieldCheck,
  administration: Settings2,
  solutions: LayoutGrid,
  ai: Sparkles,
};

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
  if (operatorButton instanceof HTMLElement) {
    operatorButton.click();
  }
}

function RailLink({ href, label, active, Icon, expanded }) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={
        active
          ? `group relative flex h-10 items-center rounded-xl bg-[#171716] text-white shadow-[0_3px_10px_rgba(20,18,15,0.16)] ${expanded ? "w-full gap-3 px-3" : "w-10 justify-center"}`
          : `group relative flex h-10 items-center rounded-xl text-[#77736C] transition hover:bg-[#F1EFEA] hover:text-[#292723] ${expanded ? "w-full gap-3 px-3" : "w-10 justify-center"}`
      }
    >
      <Icon size={17} strokeWidth={active ? 2 : 1.7} className="shrink-0" />
      {expanded ? (
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{label}</span>
      ) : (
        <span className="pointer-events-none absolute left-[52px] z-[80] hidden whitespace-nowrap rounded-lg border border-black/[0.08] bg-[#171716] px-2.5 py-1.5 text-[10px] font-medium text-white shadow-xl group-hover:block">
          {label}
        </span>
      )}
    </Link>
  );
}

export default function WorkspaceNavigationRail() {
  const businessContext = useBusinessContext() || {};
  const params = useParams();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const organizationId =
    businessContext.organization_id ||
    businessContext.organization?.id ||
    params?.organizationId ||
    null;

  useEffect(() => {
    try {
      setExpanded(window.localStorage.getItem(NAV_EXPANDED_KEY) === "true");
    } catch {
      setExpanded(false);
    }
  }, []);

  function toggleExpanded() {
    setExpanded((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(NAV_EXPANDED_KEY, next ? "true" : "false");
      } catch {
        // Navigation remains usable when storage is unavailable.
      }
      return next;
    });
  }

  if (!organizationId) return null;

  const homeHref = `/workspace/${encodeURIComponent(organizationId)}`;
  const domains = getErpDomains()
    .filter((domain) => domain.id !== "services")
    .map((domain) => {
      const href = resolveWorkspaceRoute({
        organizationId,
        moduleId: domain.id,
        route: domain.route,
      });
      return {
        ...domain,
        href,
        Icon: DOMAIN_ICONS[domain.id] || FileText,
      };
    })
    .filter((domain) => domain.href && domain.href !== "#");

  return (
    <aside
      data-avantiqo-navigation-rail="true"
      data-expanded={expanded ? "true" : "false"}
      className={`sticky top-[61px] z-40 hidden h-[calc(100dvh-61px)] shrink-0 border-r border-black/[0.07] bg-[#FBFAF8] transition-[width] duration-200 lg:flex lg:flex-col ${expanded ? "w-[224px]" : "w-[64px] items-center"}`}
    >
      <div className={`flex h-12 shrink-0 items-center border-b border-black/[0.06] ${expanded ? "justify-between px-3" : "justify-center"}`}>
        {expanded ? (
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#A37849]">Workspace</div>
            <div className="mt-0.5 truncate text-[10px] text-[#918C84]">Business areas</div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={toggleExpanded}
          title={expanded ? "Collapse navigation" : "Expand navigation"}
          aria-label={expanded ? "Collapse ERP navigation" : "Expand ERP navigation"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/[0.07] bg-white text-[#7B766E] transition hover:border-[#D6A66A]/40 hover:text-[#8D643C]"
        >
          {expanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      <nav className={`flex w-full flex-1 flex-col gap-1 overflow-y-auto py-3 ${expanded ? "items-stretch px-2.5" : "items-center px-2"}`}>
        <RailLink
          href={homeHref}
          label="Home"
          active={pathname === homeHref || pathname === `${homeHref}/`}
          Icon={Home}
          expanded={expanded}
        />

        <button
          type="button"
          onClick={openUniversalOperator}
          title="Avantiqo Intelligence"
          aria-label="Open universal Avantiqo Intelligence"
          className={`group relative mb-2 flex h-10 items-center rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] text-[#9A744B] transition hover:bg-[#D6A66A]/[0.14] ${expanded ? "w-full gap-3 px-3 text-left" : "w-10 justify-center"}`}
        >
          <Sparkles size={17} strokeWidth={1.8} className="shrink-0" />
          {expanded ? (
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">Avantiqo Intelligence</span>
          ) : (
            <span className="pointer-events-none absolute left-[52px] z-[80] hidden whitespace-nowrap rounded-lg border border-black/[0.08] bg-[#171716] px-2.5 py-1.5 text-[10px] font-medium text-white shadow-xl group-hover:block">
              Avantiqo Intelligence
            </span>
          )}
        </button>

        <div className={`mb-1 h-px bg-black/[0.07] ${expanded ? "mx-2" : "w-7"}`} />

        {expanded ? (
          <div className="px-3 pb-1 pt-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-[#AAA59D]">ERP areas</div>
        ) : null}

        {domains.map((domain) => {
          const active =
            pathname === domain.href ||
            pathname.startsWith(`${domain.href}/`);
          return (
            <RailLink
              key={domain.id}
              href={domain.href}
              label={domain.name}
              active={active}
              Icon={domain.Icon}
              expanded={expanded}
            />
          );
        })}
      </nav>

      <div className={`mb-3 mt-2 flex items-center ${expanded ? "mx-3 gap-3 rounded-xl border border-black/[0.07] bg-white px-3 py-2" : "h-9 w-9 justify-center rounded-xl border border-black/[0.07] bg-white"}`}>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F7F2EA] text-[8px] font-semibold uppercase tracking-[0.08em] text-[#9A744B]">AV</div>
        {expanded ? (
          <div className="min-w-0"><div className="truncate text-[10px] font-semibold text-[#4B4741]">Avantiqo ERP</div><div className="mt-0.5 truncate text-[8px] text-[#9D9890]">Unified business workspace</div></div>
        ) : null}
      </div>
    </aside>
  );
}
