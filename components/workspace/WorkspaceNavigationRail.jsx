"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  Activity,
  Boxes,
  ChartNoAxesCombined,
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

function RailLink({ href, label, active, Icon }) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={
        active
          ? "group relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#171716] text-white shadow-[0_3px_10px_rgba(20,18,15,0.16)]"
          : "group relative flex h-10 w-10 items-center justify-center rounded-xl text-[#77736C] transition hover:bg-[#F1EFEA] hover:text-[#292723]"
      }
    >
      <Icon size={17} strokeWidth={active ? 2 : 1.7} />
      <span className="pointer-events-none absolute left-[52px] z-[80] hidden whitespace-nowrap rounded-lg border border-black/[0.08] bg-[#171716] px-2.5 py-1.5 text-[10px] font-medium text-white shadow-xl group-hover:block">
        {label}
      </span>
    </Link>
  );
}

export default function WorkspaceNavigationRail() {
  const businessContext = useBusinessContext() || {};
  const params = useParams();
  const pathname = usePathname();
  const organizationId =
    businessContext.organization_id ||
    businessContext.organization?.id ||
    params?.organizationId ||
    null;

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
      className="sticky top-[61px] z-40 hidden h-[calc(100dvh-61px)] w-[64px] shrink-0 border-r border-black/[0.07] bg-[#FBFAF8] lg:flex lg:flex-col lg:items-center"
    >
      <nav className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-3">
        <RailLink
          href={homeHref}
          label="Home"
          active={pathname === homeHref || pathname === `${homeHref}/`}
          Icon={Home}
        />

        <button
          type="button"
          onClick={openUniversalOperator}
          title="Avantiqo Intelligence"
          aria-label="Open universal Avantiqo Intelligence"
          className="group relative mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] text-[#9A744B] transition hover:bg-[#D6A66A]/[0.14]"
        >
          <Sparkles size={17} strokeWidth={1.8} />
          <span className="pointer-events-none absolute left-[52px] z-[80] hidden whitespace-nowrap rounded-lg border border-black/[0.08] bg-[#171716] px-2.5 py-1.5 text-[10px] font-medium text-white shadow-xl group-hover:block">
            Avantiqo Intelligence
          </span>
        </button>

        <div className="mb-1 h-px w-7 bg-black/[0.07]" />

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
            />
          );
        })}
      </nav>

      <div className="mb-3 mt-2 flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.07] bg-white text-[9px] font-semibold uppercase tracking-[0.08em] text-[#9A744B] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        AV
      </div>
    </aside>
  );
}
