"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChevronRight,
  Landmark,
  ShoppingCart,
  Receipt,
  FileText,
  Scale,
  ShieldCheck,
} from "lucide-react";

export default function FinanceMegaMenu({
  organizationId,
}) {
  const [section, setSection] =
    useState("Accounting");

  const menu = {
    Accounting: [
      ["Journals", "journals"],
      ["Ledger", "ledger"],
      ["Trial Balance", "trial-balance"],
      ["Reports", "reports"],
    ],

    Procurement: [
      ["Vendors", "vendors"],
      ["Purchase Orders", "purchase-orders"],
      ["Goods Receipts", "receiving"],
      ["Invoices", "invoices"],
      ["Matching", "matching"],
      ["AP", "ap"],
      ["Payments", "payments"],
    ],

    AR: [],
    Tax: [],
    Filings: [],
    Close: [],
  };

  const icons = {
    Accounting: Landmark,
    Procurement: ShoppingCart,
    AR: Receipt,
    Tax: Scale,
    Filings: FileText,
    Close: ShieldCheck,
  };

  return (
    <div className="absolute left-0 top-full z-50 mt-3 w-[900px] overflow-hidden rounded-3xl border border-white/10 bg-[#080808]/95 backdrop-blur-xl shadow-2xl">

      <div className="grid grid-cols-[280px_1fr]">

        <div className="border-r border-white/10 p-4">

          {Object.keys(menu).map((item) => {
            const Icon = icons[item];

            return (
              <button
                key={item}
                onMouseEnter={() =>
                  setSection(item)
                }
                className={
                  section === item
                    ? "mb-2 flex w-full items-center justify-between rounded-2xl border border-[#D6A66A]/40 bg-[#D6A66A]/10 px-4 py-3 text-[#D6A66A]"
                    : "mb-2 flex w-full items-center justify-between rounded-2xl border border-transparent px-4 py-3 text-white/70 hover:bg-white/5"
                }
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} />
                  {item}
                </div>

                <ChevronRight size={16} />
              </button>
            );
          })}
        </div>

        <div className="p-6">

          <div className="mb-6 text-xs uppercase tracking-[0.35em] text-[#D6A66A]">
            {section}
          </div>

          <div className="grid gap-3 md:grid-cols-2">

            {(menu[section] || []).map(
              ([label, route]) => (
                <Link
                  key={route}
                  href={`/workspace/${organizationId}/finance/${route}`}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-[#D6A66A]/40 hover:bg-[#D6A66A]/5"
                >
                  <div className="text-white">
                    {label}
                  </div>
                </Link>
              )
            )}

          </div>

        </div>

      </div>

    </div>
  );
}
