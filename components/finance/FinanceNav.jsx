"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function FinanceNav({
  organizationId,
}) {
  const pathname = usePathname();

  const items = [
    ["Overview", `/workspace/${organizationId}/finance`],

    ["Vendors", `/workspace/${organizationId}/finance/vendors`],
    ["Purchase Orders", `/workspace/${organizationId}/finance/purchase-orders`],
    ["Goods Receipts", `/workspace/${organizationId}/finance/receiving`],
    ["Vendor Invoices", `/workspace/${organizationId}/finance/invoices`],
    ["Matching", `/workspace/${organizationId}/finance/matching`],

    ["AP", `/workspace/${organizationId}/finance/ap`],
    ["Payments", `/workspace/${organizationId}/finance/payments`],
    ["AR", `/workspace/${organizationId}/finance/ar`],

    ["Accounting", `/workspace/${organizationId}/finance/accounting`],
    ["Journals", `/workspace/${organizationId}/finance/journals`],
    ["Ledger", `/workspace/${organizationId}/finance/ledger`],
    ["Trial Balance", `/workspace/${organizationId}/finance/trial-balance`],

    ["Reports", `/workspace/${organizationId}/finance/reports`],
    ["Tax", `/workspace/${organizationId}/finance/tax`],
    ["Filings", `/workspace/${organizationId}/finance/filings`],
    ["Close", `/workspace/${organizationId}/finance/close`],
  ];

  return (
    <div className="mb-8 border-b border-white/10">
      <div className="flex gap-6 overflow-x-auto pb-4">
        {items.map(([label, href]) => {
          const active =
            pathname === href;

          return (
            <Link
              key={href}
              href={href}
              className={
                active
                  ? "text-white border-b border-[#D6A66A] pb-2"
                  : "text-white/50 hover:text-white pb-2"
              }
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
