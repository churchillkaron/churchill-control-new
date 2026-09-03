"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpenCheck,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, route: "" },
  { id: "work", label: "Work", icon: ListChecks, route: "/work" },
  { id: "review", label: "Review", icon: ShieldCheck, route: "/review" },
  { id: "books", label: "Books", icon: BookOpenCheck, route: "/books" },
  { id: "close", label: "Close", icon: LockKeyhole, route: "/close" },
  { id: "reports", label: "Reports", icon: BarChart3, route: "/reporting" },
  { id: "configure", label: "Configure", icon: Settings2, route: "/configure" },
];

const REPORT_PREFIXES = [
  "/finance/reporting",
  "/finance/statements",
  "/finance/reports",
  "/finance/management-reports",
  "/finance/report-builder",
  "/finance/scheduled-reports",
  "/finance/forecast",
  "/finance/forecasting",
  "/finance/budget",
  "/finance/budgeting",
  "/finance/financial-health",
  "/finance/finance-insights",
  "/finance/kpis",
  "/finance/executive-dashboard",
];

const CONFIGURE_PREFIXES = [
  "/finance/configure",
  "/finance/work-programs",
  "/finance/accounting-settings",
  "/finance/fiscal-periods",
  "/finance/dimensions",
  "/finance/posting-rules",
  "/finance/currencies",
  "/finance/exchange-rates",
  "/finance/payment-terms",
  "/finance/tax-settings",
  "/finance/vat-settings",
];

function periodLabel(period) {
  if (!period) return null;
  return period.period_name || period.name || period.label || null;
}

function activeSection(pathname) {
  const marker = String(pathname || "").split("/finance")[1] || "";
  const financePath = `/finance${marker}`;
  if (financePath === "/finance" || financePath === "/finance/") return "overview";
  if (financePath.startsWith("/finance/review")) return "review";
  if (financePath.startsWith("/finance/work") || financePath.startsWith("/finance/accounting-firm")) return "work";
  if (financePath.startsWith("/finance/close") || financePath.startsWith("/finance/period-close")) return "close";
  if (REPORT_PREFIXES.some((prefix) => financePath.startsWith(prefix))) return "reports";
  if (CONFIGURE_PREFIXES.some((prefix) => financePath.startsWith(prefix))) return "configure";
  return "books";
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
  const active = activeSection(pathname);
  const entityName =
    businessContext.entity?.display_name ||
    businessContext.entity?.legal_name ||
    businessContext.entity?.name ||
    null;
  const currentPeriod = periodLabel(businessContext.period);

  if (!organizationId) return null;

  return (
    <div className="mx-auto mb-4 max-w-[1720px] px-1 text-[#2A2723]">
      <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-black/[0.07] bg-white/95 px-2.5 shadow-[0_4px_20px_rgba(40,32,22,0.035)]">
        <Link
          href={`/workspace/${organizationId}/finance`}
          className="hidden shrink-0 items-center gap-2 border-r border-black/[0.06] px-2.5 py-1 md:flex"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8A633C]">Finance</span>
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
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[9px] font-semibold transition ${
                  selected
                    ? "bg-[#A37849]/[0.10] text-[#684A2D]"
                    : "text-[#777169] hover:bg-[#F8F6F2] hover:text-[#49443E]"
                }`}
              >
                <Icon size={10} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {(entityName || currentPeriod) ? (
          <div className="hidden max-w-[340px] shrink-0 items-center gap-2 border-l border-black/[0.06] px-2.5 text-[8px] text-[#918B83] xl:flex">
            {entityName ? <span className="max-w-[165px] truncate font-medium text-[#625D56]">{entityName}</span> : null}
            {entityName && currentPeriod ? <span>·</span> : null}
            {currentPeriod ? <span className="max-w-[135px] truncate">{currentPeriod}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
