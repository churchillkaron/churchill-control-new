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
  const entityName =
    businessContext.entity?.display_name ||
    businessContext.entity?.legal_name ||
    businessContext.entity?.name ||
    null;
  const currentPeriod = periodLabel(businessContext.period);

  if (!organizationId) return null;

  return (
    <div className="mx-auto mb-4 max-w-[1720px] px-1 text-[#2A2723]">
      <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-black/[0.07] bg-white/95 px-2.5 shadow-[0_4px_20px_rgba(40,32,22,0.035)]">
        <Link href={`/workspace/${organizationId}/finance`} className="hidden shrink-0 items-center gap-2 border-r border-black/[0.06] px-2.5 py-1 md:flex">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8A633C]">Finance</span>
        </Link>

        <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto py-1.5" aria-label="Finance">
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

        {(entityName || currentPeriod) ? (
          <div className="flex max-w-[360px] shrink-0 items-center gap-2 border-l border-black/[0.06] px-2.5 text-[10px] text-[#918B83]">
            {entityName ? <span className="max-w-[175px] truncate font-medium text-[#625D56]">{entityName}</span> : null}
            {entityName && currentPeriod ? <span>·</span> : null}
            {currentPeriod ? <span className="max-w-[145px] truncate">{currentPeriod}</span> : null}
          </div>
        ) : null}

        <Link
          href={`/workspace/${organizationId}/finance/configure`}
          aria-label="Finance setup"
          title="Finance setup"
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${active === "configure" ? "bg-[#A37849]/[0.10] text-[#684A2D]" : "text-[#8C867E] hover:bg-[#F8F6F2] hover:text-[#49443E]"}`}
        >
          <Settings2 size={13} />
        </Link>
      </div>
    </div>
  );
}
