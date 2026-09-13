"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpenCheck,
  Home,
  Landmark,
  ListChecks,
  LockKeyhole,
  Settings2,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { resolveFinanceNavigationSection } from "@/lib/finance/ui/FinanceInformationArchitecture";

const NAV_ITEMS = [
  { id: "overview", label: "Home", icon: Home, route: "" },
  { id: "work", label: "Work", icon: ListChecks, route: "/work" },
  { id: "books", label: "Books", icon: BookOpenCheck, route: "/books" },
  { id: "reconcile", label: "Reconcile", icon: Landmark, route: "/bank-reconciliation" },
  { id: "close", label: "Close", icon: LockKeyhole, route: "/close" },
  { id: "reports", label: "Reports", icon: BarChart3, route: "/reporting" },
];

function periodLabel(period) {
  if (!period) return null;
  return period.period_name || period.name || period.label || null;
}

export default function FinanceShellNavigation() {
  const pathname = usePathname();
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;
  const active = resolveFinanceNavigationSection(pathname);
  const organizationName = businessContext.organization?.name || null;
  const entityName =
    businessContext.entity?.display_name ||
    businessContext.entity?.legal_name ||
    businessContext.entity?.name ||
    null;
  const currentPeriod = periodLabel(businessContext.period);

  if (!organizationId) return null;

  return (
    <div className="mx-auto mb-4 max-w-[1720px] px-1 text-[#2A2723]">
      <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-2xl border border-black/[0.07] bg-white/95 px-2.5 py-1.5 shadow-[0_4px_20px_rgba(40,32,22,0.035)] md:flex-nowrap md:py-0">
        <Link href={`/workspace/${organizationId}/finance`} className="hidden shrink-0 items-center gap-2 border-r border-black/[0.06] px-2.5 py-1 md:flex">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8A633C]">Finance</span>
        </Link>

        <nav className="order-1 flex min-w-0 flex-1 gap-0.5 overflow-x-auto py-1 md:order-none md:py-1.5" aria-label="Finance">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const selected = active === item.id;
            return (
              <Link
                key={item.id}
                href={`/workspace/${organizationId}/finance${item.route}`}
                aria-current={selected ? "page" : undefined}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold transition ${selected ? "bg-[#A37849]/[0.10] text-[#684A2D]" : "text-[#777169] hover:bg-[#F8F6F2] hover:text-[#49443E]"}`}
              >
                <Icon size={12} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {(organizationName || entityName || currentPeriod) ? (
          <div className="order-3 flex w-full min-w-0 items-center gap-2 overflow-x-auto border-t border-black/[0.06] px-1.5 py-2 text-[10px] text-[#918B83] md:order-none md:w-auto md:max-w-[480px] md:shrink-0 md:border-l md:border-t-0 md:px-2.5 md:py-0">
            {organizationName ? (
              <span className="min-w-0 max-w-[160px] shrink-0 truncate rounded-md bg-[#F8F5F0] px-2 py-1 font-medium text-[#625D56]" title={`Organization: ${organizationName}`}>
                <span className="mr-1 text-[#A37849]">Org</span>{organizationName}
              </span>
            ) : null}
            {entityName ? (
              <span className="min-w-0 max-w-[160px] shrink-0 truncate rounded-md bg-[#F8F5F0] px-2 py-1 font-medium text-[#625D56]" title={`Entity: ${entityName}`}>
                <span className="mr-1 text-[#A37849]">Entity</span>{entityName}
              </span>
            ) : null}
            {currentPeriod ? (
              <span className="min-w-0 max-w-[145px] shrink-0 truncate rounded-md bg-[#F8F5F0] px-2 py-1" title={`Period: ${currentPeriod}`}>
                <span className="mr-1 text-[#A37849]">Period</span>{currentPeriod}
              </span>
            ) : null}
          </div>
        ) : null}

        <Link
          href={`/workspace/${organizationId}/finance/configure`}
          aria-label="Finance setup"
          title="Finance setup"
          className={`order-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition md:order-none ${active === "configure" ? "bg-[#A37849]/[0.10] text-[#684A2D]" : "text-[#8C867E] hover:bg-[#F8F6F2] hover:text-[#49443E]"}`}
        >
          <Settings2 size={13} />
        </Link>
      </div>
    </div>
  );
}
