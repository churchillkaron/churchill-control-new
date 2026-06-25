"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function FinanceNav({
  organizationId,
}) {
  const pathname = usePathname();

  const financeRoot = [
    ["Accounting", `/workspace/${organizationId}/finance/accounting`],
    ["Procurement", `/workspace/${organizationId}/finance/procure-to-pay`],
    ["AR", `/workspace/${organizationId}/finance/ar`],
    ["Tax", `/workspace/${organizationId}/finance/tax`],
    ["Filings", `/workspace/${organizationId}/finance/filings`],
    ["Close", `/workspace/${organizationId}/finance/close`],
  ];

  const accountingMenu = [
    ["Journals", `/workspace/${organizationId}/finance/journals`],
    ["Ledger", `/workspace/${organizationId}/finance/ledger`],
    ["Trial Balance", `/workspace/${organizationId}/finance/trial-balance`],
    ["Reports", `/workspace/${organizationId}/finance/reports`],
  ];

  const procurementMenu = [
    ["Vendors", `/workspace/${organizationId}/finance/vendors`],
    ["Purchase Orders", `/workspace/${organizationId}/finance/purchase-orders`],
    ["Goods Receipts", `/workspace/${organizationId}/finance/receiving`],
    ["Vendor Invoices", `/workspace/${organizationId}/finance/invoices`],
    ["Matching", `/workspace/${organizationId}/finance/matching`],
    ["AP", `/workspace/${organizationId}/finance/ap`],
    ["Payments", `/workspace/${organizationId}/finance/payments`],
  ];

  let childMenu = [];

  if (
    pathname.includes("/finance/accounting") ||
    pathname.includes("/finance/journals") ||
    pathname.includes("/finance/ledger") ||
    pathname.includes("/finance/trial-balance") ||
    pathname.includes("/finance/reports")
  ) {
    childMenu = accountingMenu;
  }

  if (
    pathname.includes("/finance/procure-to-pay") ||
    pathname.includes("/finance/vendors") ||
    pathname.includes("/finance/purchase-orders") ||
    pathname.includes("/finance/receiving") ||
    pathname.includes("/finance/invoices") ||
    pathname.includes("/finance/matching") ||
    pathname.includes("/finance/ap") ||
    pathname.includes("/finance/payments")
  ) {
    childMenu = procurementMenu;
  }

  return (
    <div className="border-b border-white/10">

      <div className="px-8 py-4">
        <div className="flex flex-wrap gap-3">

          {financeRoot.map(([label, href]) => {

            const active =
              pathname === href ||
              pathname.startsWith(href + "/");

            return (
              <Link
                key={href}
                href={href}
                className={
                  active
                    ? "px-4 py-2 rounded-xl bg-[#D6A66A]/20 border border-[#D6A66A]/50 text-[#D6A66A]"
                    : "px-4 py-2 rounded-xl border border-white/10 text-white/70"
                }
              >
                {label}
              </Link>
            );
          })}

        </div>
      </div>

      {childMenu.length > 0 && (
        <div className="border-t border-white/5 px-8 py-4">

          <div className="flex flex-wrap gap-3">

            {childMenu.map(([label, href]) => {

              const active =
                pathname === href ||
                pathname.startsWith(href + "/");

              return (
                <Link
                  key={href}
                  href={href}
                  className={
                    active
                      ? "px-4 py-2 rounded-xl bg-[#D6A66A]/20 border border-[#D6A66A]/50 text-[#D6A66A]"
                      : "px-4 py-2 rounded-xl border border-white/10 text-white/70"
                  }
                >
                  {label}
                </Link>
              );
            })}

          </div>

        </div>
      )}

    </div>
  );
}
