"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";

import { getWorkspaceGroups } from "@/lib/platform/registry/erpRegistry";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";

const DESTINATIONS = [
  { id: "home", name: "Finance home", description: "Practice overview, priorities and accounting health", route: "" },
  { id: "clients", name: "Clients", description: "Client list, ownership, deadlines and engagement files", route: "/clients" },
  { id: "work", name: "Work", description: "My work, overdue items, client waits and review queue", route: "/work" },
  { id: "books", name: "Books", description: "Invoices, bills, banking, bank reconciliation, trial balance, journals, ledger and accounting records", route: "/books" },
  { id: "close", name: "Close & Tax", description: "Period close, year-end, VAT, statutory filing, FX and depreciation", route: "/close" },
  { id: "reports", name: "Reports", description: "Financial statements, management reporting, budgets and forecasts", route: "/reporting" },
  { id: "settings", name: "Settings", description: "Accounting setup, periods, dimensions, tax codes and permissions", route: "/configure" },
];

const SEARCH_ALIASES = {
  accounts_receivable: "AR receivables debtors customer balances money owed to us",
  customer_invoices: "sales invoices AR receivables billing customer invoice",
  accounts_payable: "AP payables creditors supplier bills vendor bills money we owe",
  bank_statements: "bank feed bank import statement transactions",
  bank_reconciliation: "reconcile bank rec bank reconciliation matching",
  payments: "supplier payment vendor payment customer payment pay bills",
  general_ledger: "GL ledger nominal ledger account activity",
  journals: "journal entry manual journal adjustment posting",
  trial_balance: "TB trial balance debit credit",
  financial_statements: "P&L profit and loss income statement balance sheet cash flow",
  vat_returns: "VAT tax return filing sales tax",
  statutory_filings: "statutory tax filing compliance return",
  period_close: "month end month-end close period end period-end close",
  year_end: "year end year-end annual close",
  fixed_assets: "asset register PPE fixed assets",
  depreciation: "depreciation fixed asset expense",
  fx_revaluation: "foreign exchange FX revaluation currency revalue",
};

function searchable(...values) {
  return values.filter(Boolean).join(" ").toLowerCase();
}

export default function FinanceQuickFind({ organizationId }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const groups = useMemo(() => getWorkspaceGroups("finance"), []);

  const items = useMemo(() => {
    const capabilityItems = groups.flatMap((group) => (group.items || []).map((item) => ({
      id: `capability:${item.id}`,
      name: item.name || item.id,
      description: item.description || group.name || "Finance capability",
      group: group.name || "Finance",
      href: resolveWorkspaceRoute({ organizationId, workspaceId: "finance", moduleId: item.id, route: item.route }),
      search: searchable(item.id, item.name, item.description, item.route, group.id, group.name, group.description, SEARCH_ALIASES[item.id]),
    })));
    const destinationItems = DESTINATIONS.map((item) => ({
      ...item,
      group: "Go to",
      href: `/workspace/${organizationId}/finance${item.route}`,
      search: searchable(item.id, item.name, item.description),
    }));
    return [...destinationItems, ...capabilityItems];
  }, [groups, organizationId]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return DESTINATIONS.slice(0, 7).map((item) => ({
      ...item,
      group: "Go to",
      href: `/workspace/${organizationId}/finance${item.route}`,
    }));
    return items.filter((item) => item.search.includes(needle)).slice(0, 12);
  }, [items, query, organizationId]);

  if (!organizationId) return null;

  const open = focused || Boolean(query);

  return (
    <div className="relative hidden w-[260px] shrink-0 lg:block xl:w-[320px]">
      <label className="flex h-8 items-center gap-2 rounded-lg border border-black/[0.07] bg-[#FAF9F7] px-2.5 text-[#8E877F] transition focus-within:border-[#A37849]/30 focus-within:bg-white">
        <Search size={10} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder="Find anything in Finance…"
          aria-label="Find anything in Finance"
          className="min-w-0 flex-1 bg-transparent text-[9px] text-[#3F3A35] outline-none placeholder:text-[#AAA39B]"
        />
        {query ? <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setQuery("")} className="text-[#AAA39B] hover:text-[#6B645D]" aria-label="Clear Finance search"><X size={9} /></button> : null}
      </label>

      {open ? (
        <div className="absolute right-0 top-10 z-50 w-[430px] overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_18px_50px_rgba(38,31,23,0.14)]">
          <div className="border-b border-black/[0.055] px-3.5 py-2.5">
            <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#9A938B]">Finance Quick Find</div>
            <div className="mt-0.5 text-[8px] text-[#AAA39B]">Search by task or accounting term — no menu knowledge required.</div>
          </div>
          <div className="max-h-[420px] overflow-y-auto p-1.5">
            {results.map((item) => (
              <Link key={item.id} href={item.href} className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-[#FAF8F4]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="truncate text-[9px] font-semibold text-[#45403A] group-hover:text-[#76583A]">{item.name}</span><span className="shrink-0 text-[7px] uppercase tracking-[0.08em] text-[#A39C94]">{item.group}</span></div>
                  <div className="mt-0.5 truncate text-[8px] text-[#958E86]">{item.description}</div>
                </div>
                <ArrowRight size={9} className="shrink-0 text-[#B5AEA6] group-hover:text-[#A37849]" />
              </Link>
            ))}
            {!results.length ? <div className="px-3 py-8 text-center text-[9px] text-[#958E86]">No Finance result. Try an accounting term such as “VAT”, “bank”, “invoice”, “trial balance” or “journal”.</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
