"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  Building2,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  FileBarChart,
  FileCheck2,
  FileSpreadsheet,
  Landmark,
  LayoutDashboard,
  Receipt,
  Scale,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Accounting Overview",
    description:
      "Main accounting command center, financial controls and accounting visibility.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/accounting/overview" },
      { name: "Live Runtime", route: "/accounting/live" },
      { name: "Accounting Dashboard", route: "/accounting/dashboard" },
      { name: "Accounting Health", route: "/accounting/health" },
    ],
  },

  {
    title: "General Ledger",
    description:
      "General ledger operations, chart of accounts and journal management.",
    icon: FileSpreadsheet,
    items: [
      { name: "General Ledger", route: "/accounting/ledger" },
      { name: "Chart of Accounts", route: "/accounting/chart-of-accounts" },
      { name: "Journal Entries", route: "/accounting/journals" },
      { name: "Ledger Posting", route: "/accounting/posting" },
      { name: "Account Balances", route: "/accounting/balances" },
    ],
  },

  {
    title: "Accounts Payable",
    description:
      "Supplier invoices, AP workflows and outgoing payment operations.",
    icon: Receipt,
    items: [
      { name: "Accounts Payable", route: "/accounting/ap" },
      { name: "Supplier Invoices", route: "/accounting/invoices" },
      { name: "Payment Queue", route: "/accounting/payments" },
      { name: "Invoice Matching", route: "/accounting/matching" },
      { name: "Vendor Balances", route: "/accounting/vendor-balances" },
    ],
  },

  {
    title: "Accounts Receivable",
    description:
      "Receivables, customer invoicing and incoming payment tracking.",
    icon: Wallet,
    items: [
      { name: "Accounts Receivable", route: "/accounting/ar" },
      { name: "Customer Invoices", route: "/accounting/customer-invoices" },
      { name: "Receivable Tracking", route: "/accounting/receivables" },
      { name: "Payment Collection", route: "/accounting/collections" },
      { name: "Outstanding Balances", route: "/accounting/outstanding" },
    ],
  },

  {
    title: "Banking & Reconciliation",
    description:
      "Bank reconciliation, transaction matching and cash verification.",
    icon: Landmark,
    items: [
      { name: "Bank Accounts", route: "/accounting/banks" },
      { name: "Reconciliation", route: "/accounting/reconciliation" },
      { name: "Transaction Matching", route: "/accounting/transactions" },
      { name: "Cash Verification", route: "/accounting/cash" },
      { name: "Bank Statements", route: "/accounting/statements" },
    ],
  },

  {
    title: "Financial Statements",
    description:
      "Financial reporting, statements and accounting disclosures.",
    icon: FileBarChart,
    items: [
      { name: "Trial Balance", route: "/accounting/trial-balance" },
      { name: "Balance Sheet", route: "/accounting/balance-sheet" },
      { name: "Profit & Loss", route: "/accounting/profit-loss" },
      { name: "Cashflow Statement", route: "/accounting/cashflow" },
      { name: "Financial Reports", route: "/accounting/reports" },
    ],
  },

  {
    title: "Tax & Compliance",
    description:
      "Tax operations, VAT handling and compliance management.",
    icon: ShieldCheck,
    items: [
      { name: "Tax Runtime", route: "/accounting/tax" },
      { name: "VAT Management", route: "/accounting/vat" },
      { name: "Tax Reports", route: "/accounting/tax-reports" },
      { name: "Compliance Runtime", route: "/accounting/compliance" },
      { name: "Regulatory Filings", route: "/accounting/filings" },
    ],
  },

  {
    title: "Assets & Depreciation",
    description:
      "Fixed assets, depreciation schedules and asset accounting.",
    icon: Building2,
    items: [
      { name: "Fixed Assets", route: "/accounting/assets" },
      { name: "Depreciation", route: "/accounting/depreciation" },
      { name: "Asset Registers", route: "/accounting/asset-register" },
      { name: "Asset Valuation", route: "/accounting/asset-valuation" },
      { name: "Asset Lifecycle", route: "/accounting/asset-lifecycle" },
    ],
  },

  {
    title: "Accounting Controls",
    description:
      "Period close, audit operations and accounting governance controls.",
    icon: ClipboardCheck,
    items: [
      { name: "Accounting Periods", route: "/accounting/periods" },
      { name: "Month-End Close", route: "/accounting/close" },
      { name: "Audit Runtime", route: "/accounting/audit" },
      { name: "Approval Controls", route: "/accounting/controls" },
      { name: "Accounting Logs", route: "/accounting/logs" },
    ],
  },

  {
    title: "Accounting Analytics",
    description:
      "Accounting analytics, financial intelligence and operational visibility.",
    icon: BarChart3,
    items: [
      { name: "Accounting Analytics", route: "/accounting/analytics" },
      { name: "Expense Analysis", route: "/accounting/expenses" },
      { name: "Cost Analysis", route: "/accounting/cost-analysis" },
      { name: "Variance Analysis", route: "/accounting/variance" },
      { name: "Financial Metrics", route: "/accounting/metrics" },
    ],
  },

  {
    title: "AI Accounting Intelligence",
    description:
      "AI accounting assistance, anomaly detection and accounting automation.",
    icon: Brain,
    items: [
      { name: "Accounting AI", route: "/accounting/ai" },
      { name: "AI Recommendations", route: "/accounting/recommendations" },
      { name: "Anomaly Detection", route: "/accounting/anomalies" },
      { name: "Automation Runtime", route: "/accounting/automation" },
      { name: "Forecast Assistance", route: "/accounting/forecasting" },
    ],
  },

];

const STATUS = [

  {
    label: "Accounting Runtime",
    value: "ACTIVE",
  },

  {
    label: "Ledger Engine",
    value: "ONLINE",
  },

  {
    label: "Compliance",
    value: "RUNNING",
  },

  {
    label: "Accounting AI",
    value: "ARMED",
  },

];

const QUICK_ACTIONS = [

  "Review journal entries",
  "Check unpaid invoices",
  "Run reconciliation",
  "Review accounting periods",
  "Analyze expenses",
  "Review tax compliance",

];

export default function AccountingPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10">

            <Calculator className="h-5 w-5 text-emerald-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400">

            Churchill Platform

          </div>

        </div>

        <div className="flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Accounting

            </h1>

            <p className="max-w-5xl text-lg leading-relaxed text-white/50">

              Enterprise accounting runtime for ledgers, AP/AR,
              reconciliation, compliance, reporting and accounting controls.

            </p>

          </div>

          <Link
            href="/accounting/live"
            className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20"
          >

            Open Accounting Runtime

          </Link>

        </div>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-emerald-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="mb-10 rounded-[40px] border border-emerald-500/20 bg-emerald-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10">

              <Sparkles className="h-8 w-8 text-emerald-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Accounting AI Command

              </div>

              <div className="text-white/40">

                Analyze journals, reconciliation, tax compliance and accounting controls.

              </div>

            </div>

          </div>

          <Link
            href="/accounting/ai"
            className="rounded-2xl border border-emerald-500/20 bg-black/30 px-5 py-3 text-sm text-emerald-300"
          >

            Open Accounting Intelligence

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-emerald-400" />

          <input
            placeholder="Ask accounting AI to analyze ledgers, reconciliation or compliance..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-emerald-500 px-6 py-3 font-medium text-white">

            Run

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {QUICK_ACTIONS.map((action) => (

            <button
              key={action}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-white"
            >

              {action}

            </button>

          ))}

        </div>

      </div>

      <div className="grid grid-cols-2 gap-6">

        {SECTIONS.map((section) => {

          const Icon = section.icon;

          return (

            <div
              key={section.title}
              className="rounded-[36px] border border-white/10 bg-white/[0.03] p-8"
            >

              <div className="mb-8 flex items-start justify-between gap-6">

                <div className="flex gap-5">

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10">

                    <Icon className="h-8 w-8 text-emerald-400" />

                  </div>

                  <div>

                    <div className="mb-2 text-3xl font-light">

                      {section.title}

                    </div>

                    <div className="max-w-xl text-white/45">

                      {section.description}

                    </div>

                  </div>

                </div>

                <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/40">

                  Runtime

                </div>

              </div>

              <div className="grid grid-cols-2 gap-3">

                {section.items.map((item) => (

                  <Link
                    key={item.route}
                    href={item.route}
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-emerald-500/40 hover:bg-emerald-500/5"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-emerald-400" />

                    </div>

                  </Link>

                ))}

              </div>

            </div>

          );

        })}

      </div>

    </main>

  );

}
