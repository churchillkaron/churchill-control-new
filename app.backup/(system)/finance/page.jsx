"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  Bot,
  Calculator,
  ClipboardCheck,
  CreditCard,
  FileBarChart,
  FileText,
  Landmark,
  LineChart,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

const FINANCE_SECTIONS = [

  {
    title: "Financial Overview",
    description:
      "Main finance cockpit, live financial health and executive finance state.",
    icon: Landmark,
    color: "violet",
    items: [
      {
        name: "Overview",
        route: "/finance/overview",
      },
      {
        name: "Live Runtime",
        route: "/finance/live",
      },
      {
        name: "Executive Finance",
        route: "/finance/executive",
      },
      {
        name: "Forecast",
        route: "/finance/forecast",
      },
    ],
  },

  {
    title: "Accounting",
    description:
      "General ledger, journals, chart of accounts, trial balance and close.",
    icon: Calculator,
    color: "cyan",
    items: [
      {
        name: "General Ledger",
        route: "/finance/general-ledger",
      },
      {
        name: "Chart of Accounts",
        route: "/finance/chart-of-accounts",
      },
      {
        name: "Trial Balance",
        route: "/finance/trial-balance",
      },
      {
        name: "Period Close",
        route: "/finance/period-close",
      },
      {
        name: "Reconciliation",
        route: "/finance/reconciliation",
      },
    ],
  },

  {
    title: "Accounts Payable",
    description:
      "Vendor invoices, AP control, invoice matching and payment workflow.",
    icon: Receipt,
    color: "emerald",
    items: [
      {
        name: "Accounts Payable",
        route: "/finance/accounts-payable",
      },
      {
        name: "Vendors",
        route: "/finance/vendors",
      },
      {
        name: "Payments",
        route: "/finance/payments",
      },
      {
        name: "Invoice Matching",
        route: "/finance/invoice-matching",
      },
    ],
  },

  {
    title: "Procurement Finance",
    description:
      "Purchase orders, receiving, supplier cost control and procurement finance.",
    icon: ClipboardCheck,
    color: "amber",
    items: [
      {
        name: "Purchase Orders",
        route: "/finance/purchase-orders",
      },
      {
        name: "Purchase Requests",
        route: "/finance/purchase-requests",
      },
      {
        name: "Goods Receiving",
        route: "/finance/goods-receiving",
      },
      {
        name: "Food Cost",
        route: "/finance/food-cost",
      },
    ],
  },

  {
    title: "Payroll & Staff Cost",
    description:
      "Payroll, service charge, payouts, salary cost and department labor control.",
    icon: Users,
    color: "pink",
    items: [
      {
        name: "Payroll",
        route: "/finance/payroll",
      },
      {
        name: "Payouts",
        route: "/payroll-payouts",
      },
      {
        name: "Service Charge",
        route: "/servicecharge/live",
      },
      {
        name: "Performance",
        route: "/performance/departments",
      },
    ],
  },

  {
    title: "Budgeting & Forecasting",
    description:
      "Budgets, variance, scenario planning and AI-supported finance projection.",
    icon: TrendingUp,
    color: "blue",
    items: [
      {
        name: "Budgets",
        route: "/finance/budgets",
      },
      {
        name: "Budgeting",
        route: "/finance/budgeting",
      },
      {
        name: "Cashflow",
        route: "/finance/cashflow",
      },
      {
        name: "Forecast",
        route: "/finance/forecast",
      },
    ],
  },

  {
    title: "Financial Reporting",
    description:
      "P&L, balance sheet, cashflow reports, consolidated reporting and exports.",
    icon: FileBarChart,
    color: "purple",
    items: [
      {
        name: "Reports",
        route: "/finance/reports",
      },
      {
        name: "Profit & Loss",
        route: "/finance/profit-loss",
      },
      {
        name: "Balance Sheet",
        route: "/finance/balance-sheet",
      },
      {
        name: "Consolidated Reporting",
        route: "/finance/consolidated-reporting",
      },
    ],
  },

  {
    title: "Assets, Tax & Compliance",
    description:
      "Fixed assets, depreciation, tax, legal entities and audit compliance.",
    icon: ShieldCheck,
    color: "red",
    items: [
      {
        name: "Fixed Assets",
        route: "/finance/fixed-assets",
      },
      {
        name: "Depreciation",
        route: "/finance/depreciation",
      },
      {
        name: "Tax",
        route: "/finance/tax",
      },
      {
        name: "Legal Entities",
        route: "/finance/legal-entities",
      },
      {
        name: "Intercompany",
        route: "/finance/intercompany",
      },
    ],
  },

];

const QUICK_STATS = [

  {
    label: "Finance Runtime",
    value: "ACTIVE",
    icon: Activity,
  },

  {
    label: "Accounting",
    value: "ONLINE",
    icon: Calculator,
  },

  {
    label: "Approvals",
    value: "READY",
    icon: ClipboardCheck,
  },

  {
    label: "AI Finance",
    value: "ARMED",
    icon: Bot,
  },

];

const AI_ACTIONS = [

  "Analyze cashflow risk",
  "Review food cost variance",
  "Detect abnormal expenses",
  "Forecast payroll impact",
  "Prepare month-end checklist",
  "Find unpaid vendor invoices",

];

export default function FinancePage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      {/* HERO */}

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/10">

            <Landmark className="h-5 w-5 text-violet-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-violet-400">

            Churchill Financial Operating Center

          </div>

        </div>

        <div className="mb-5 flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Finance

            </h1>

            <p className="max-w-4xl text-lg leading-relaxed text-white/50">

              Enterprise finance runtime for accounting, AP, procurement,
              payroll, reporting, budgeting, tax, compliance and AI financial control.

            </p>

          </div>

          <Link
            href="/finance/live"
            className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm font-medium text-emerald-300 transition-all hover:bg-emerald-500/20"
          >

            Open Live Runtime

          </Link>

        </div>

      </div>

      {/* TOP STATUS */}

      <div className="mb-10 grid grid-cols-4 gap-6">

        {QUICK_STATS.map(
          stat => {

            const Icon =
              stat.icon;

            return (

              <div
                key={stat.label}
                className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
              >

                <Icon className="mb-5 h-8 w-8 text-violet-400" />

                <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

                  {stat.label}

                </div>

                <div className="text-3xl font-light">

                  {stat.value}

                </div>

              </div>

            );

          }
        )}

      </div>

      {/* AI FINANCE COMMAND */}

      <div className="mb-10 rounded-[40px] border border-violet-500/20 bg-violet-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-500/10">

              <Sparkles className="h-8 w-8 text-violet-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Finance AI Command

              </div>

              <div className="text-white/40">

                Ask Churchill to analyze, forecast, detect risk or prepare financial workflows.

              </div>

            </div>

          </div>

          <Link
            href="/intelligence/finance"
            className="rounded-2xl border border-violet-500/20 bg-black/30 px-5 py-3 text-sm text-violet-300 hover:bg-violet-500/10"
          >

            Open Finance Intelligence

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-violet-400" />

          <input
            placeholder="Ask finance AI to analyze cashflow, AP, payroll, budget, tax or risk..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-violet-500 px-6 py-3 font-medium text-white transition-all hover:bg-violet-400">

            Run

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {AI_ACTIONS.map(
            action => (

              <button
                key={action}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 transition-all hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-white"
              >

                {action}

              </button>

            )
          )}

        </div>

      </div>

      {/* FINANCE SECTIONS */}

      <div className="grid grid-cols-2 gap-6">

        {FINANCE_SECTIONS.map(
          section => {

            const Icon =
              section.icon;

            return (

              <div
                key={section.title}
                className="rounded-[36px] border border-white/10 bg-white/[0.03] p-8"
              >

                <div className="mb-8 flex items-start justify-between gap-6">

                  <div className="flex items-start gap-5">

                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-violet-500/10">

                      <Icon className="h-8 w-8 text-violet-400" />

                    </div>

                    <div>

                      <div className="mb-2 text-3xl font-light">

                        {section.title}

                      </div>

                      <div className="max-w-xl leading-relaxed text-white/45">

                        {section.description}

                      </div>

                    </div>

                  </div>

                  <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/40">

                    Runtime

                  </div>

                </div>

                <div className="grid grid-cols-2 gap-3">

                  {section.items.map(
                    item => (

                      <Link
                        key={item.route}
                        href={item.route}
                        className="group rounded-2xl border border-white/10 bg-black/30 p-4 transition-all hover:border-violet-500/40 hover:bg-violet-500/5"
                      >

                        <div className="flex items-center justify-between gap-3">

                          <div className="text-white/70">

                            {item.name}

                          </div>

                          <ArrowRight className="h-4 w-4 text-white/20 transition-all group-hover:translate-x-1 group-hover:text-violet-400" />

                        </div>

                      </Link>

                    )
                  )}

                </div>

              </div>

            );

          }
        )}

      </div>

      {/* LOWER CONTROL STRIP */}

      <div className="mt-10 grid grid-cols-4 gap-6">

        <Link
          href="/finance/reports"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-violet-500/40 hover:bg-violet-500/5"
        >

          <FileText className="mb-5 h-8 w-8 text-violet-400" />

          <div className="mb-2 text-2xl font-light">

            Reports

          </div>

          <div className="text-sm text-white/40">

            Complete financial reporting center.

          </div>

        </Link>

        <Link
          href="/finance/cashflow"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
        >

          <Wallet className="mb-5 h-8 w-8 text-emerald-400" />

          <div className="mb-2 text-2xl font-light">

            Cashflow

          </div>

          <div className="text-sm text-white/40">

            Liquidity and cash movement control.

          </div>

        </Link>

        <Link
          href="/finance/profit-loss"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/5"
        >

          <LineChart className="mb-5 h-8 w-8 text-cyan-400" />

          <div className="mb-2 text-2xl font-light">

            P&L

          </div>

          <div className="text-sm text-white/40">

            Profit and loss runtime view.

          </div>

        </Link>

        <Link
          href="/finance/tax"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-red-500/40 hover:bg-red-500/5"
        >

          <AlertTriangle className="mb-5 h-8 w-8 text-red-400" />

          <div className="mb-2 text-2xl font-light">

            Tax

          </div>

          <div className="text-sm text-white/40">

            Tax, VAT and compliance control.

          </div>

        </Link>

      </div>

    </main>

  );

}
