"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  Building2,
  CalendarRange,
  ClipboardCheck,
  DollarSign,
  Download,
  Factory,
  FileBarChart,
  FileSpreadsheet,
  LayoutDashboard,
  LineChart,
  Package,
  PieChart,
  Presentation,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Reports Overview",
    description:
      "Main enterprise reporting command center and cross-system intelligence runtime.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/reports/overview" },
      { name: "Live Runtime", route: "/reports/live" },
      { name: "Executive Dashboard", route: "/reports/dashboard" },
      { name: "KPI Center", route: "/reports/kpis" },
    ],
  },

  {
    title: "Executive Intelligence",
    description:
      "Executive reporting, business intelligence and strategic visibility.",
    icon: Presentation,
    items: [
      { name: "Executive Reports", route: "/reports/executive" },
      { name: "Business Intelligence", route: "/reports/intelligence" },
      { name: "Performance Overview", route: "/reports/performance" },
      { name: "Strategic Analytics", route: "/reports/strategy" },
      { name: "Board Reports", route: "/reports/board" },
    ],
  },

  {
    title: "Financial Reports",
    description:
      "Financial statements, profitability analysis and accounting reporting.",
    icon: DollarSign,
    items: [
      { name: "Financial Reports", route: "/reports/financial" },
      { name: "Profit & Loss", route: "/reports/profit-loss" },
      { name: "Cashflow Reports", route: "/reports/cashflow" },
      { name: "Expense Reports", route: "/reports/expenses" },
      { name: "Accounting Reports", route: "/reports/accounting" },
    ],
  },

  {
    title: "Operational Reports",
    description:
      "Operations reporting, service runtime and realtime operational analytics.",
    icon: BarChart3,
    items: [
      { name: "Operational Reports", route: "/reports/operations" },
      { name: "Service Analytics", route: "/reports/service" },
      { name: "Order Performance", route: "/reports/orders" },
      { name: "Floor Analytics", route: "/reports/floor" },
      { name: "Runtime Metrics", route: "/reports/runtime" },
    ],
  },

  {
    title: "Inventory & Procurement",
    description:
      "Inventory intelligence, procurement reporting and warehouse analytics.",
    icon: Package,
    items: [
      { name: "Inventory Reports", route: "/reports/inventory" },
      { name: "Procurement Reports", route: "/reports/procurement" },
      { name: "Stock Analytics", route: "/reports/stock" },
      { name: "Warehouse Reports", route: "/reports/warehouse" },
      { name: "Supplier Analytics", route: "/reports/suppliers" },
    ],
  },

  {
    title: "Production Reports",
    description:
      "Production intelligence, recipe analytics and kitchen performance reporting.",
    icon: Factory,
    items: [
      { name: "Production Reports", route: "/reports/production" },
      { name: "Food Cost Reports", route: "/reports/food-cost" },
      { name: "Waste Reports", route: "/reports/waste" },
      { name: "Kitchen Analytics", route: "/reports/kitchen" },
      { name: "Recipe Performance", route: "/reports/recipes" },
    ],
  },

  {
    title: "Customer & Marketing",
    description:
      "Customer intelligence, campaign performance and retention analytics.",
    icon: Users,
    items: [
      { name: "Customer Reports", route: "/reports/customer" },
      { name: "Marketing Reports", route: "/reports/marketing" },
      { name: "Campaign Analytics", route: "/reports/campaigns" },
      { name: "Customer Retention", route: "/reports/retention" },
      { name: "Guest Intelligence", route: "/reports/guests" },
    ],
  },

  {
    title: "Payroll & Staff",
    description:
      "Payroll reporting, labor analytics and staff performance intelligence.",
    icon: ClipboardCheck,
    items: [
      { name: "Payroll Reports", route: "/reports/payroll" },
      { name: "Staff Performance", route: "/reports/staff" },
      { name: "Labor Analytics", route: "/reports/labor" },
      { name: "Attendance Reports", route: "/reports/attendance" },
      { name: "Department Metrics", route: "/reports/departments" },
    ],
  },

  {
    title: "Compliance & Audit",
    description:
      "Audit reporting, compliance visibility and governance intelligence.",
    icon: ShieldCheck,
    items: [
      { name: "Audit Reports", route: "/reports/audit" },
      { name: "Compliance Reports", route: "/reports/compliance" },
      { name: "Control Reports", route: "/reports/controls" },
      { name: "Approval Logs", route: "/reports/approvals" },
      { name: "Risk Reports", route: "/reports/risk" },
    ],
  },

  {
    title: "Forecasting & AI",
    description:
      "AI intelligence, forecasting and predictive enterprise analytics.",
    icon: Brain,
    items: [
      { name: "AI Reports", route: "/reports/ai" },
      { name: "Forecast Reports", route: "/reports/forecasting" },
      { name: "Predictive Analytics", route: "/reports/predictions" },
      { name: "Trend Analysis", route: "/reports/trends" },
      { name: "Optimization Reports", route: "/reports/optimization" },
    ],
  },

  {
    title: "Exports & Scheduling",
    description:
      "Scheduled reporting, exports and enterprise distribution operations.",
    icon: Download,
    items: [
      { name: "Scheduled Reports", route: "/reports/scheduled" },
      { name: "Export Center", route: "/reports/export" },
      { name: "Report Builder", route: "/reports/builder" },
      { name: "Templates", route: "/reports/templates" },
      { name: "Distribution Center", route: "/reports/distribution" },
    ],
  },

];

const STATUS = [

  {
    label: "Reporting Runtime",
    value: "ACTIVE",
  },

  {
    label: "Enterprise Analytics",
    value: "ONLINE",
  },

  {
    label: "Cross-System Intelligence",
    value: "RUNNING",
  },

  {
    label: "Reporting AI",
    value: "ARMED",
  },

];

const QUICK_ACTIONS = [

  "Generate executive report",
  "Analyze food cost trends",
  "Review labor analytics",
  "Export financial reports",
  "Analyze retention metrics",
  "Forecast operational trends",

];

export default function ReportsPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/10">

            <FileBarChart className="h-5 w-5 text-violet-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-violet-400">

            Churchill Platform

          </div>

        </div>

        <div className="flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Reports

            </h1>

            <p className="max-w-5xl text-lg leading-relaxed text-white/50">

              Enterprise reporting runtime for cross-system analytics,
              executive intelligence, forecasting and operational visibility.

            </p>

          </div>

          <Link
            href="/reports/live"
            className="rounded-2xl border border-violet-500/20 bg-violet-500/10 px-5 py-4 text-sm font-medium text-violet-300 hover:bg-violet-500/20"
          >

            Open Reports Runtime

          </Link>

        </div>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-violet-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="mb-10 rounded-[40px] border border-violet-500/20 bg-violet-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-500/10">

              <Sparkles className="h-8 w-8 text-violet-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Reporting AI Command

              </div>

              <div className="text-white/40">

                Generate enterprise intelligence, forecasting and operational analytics.

              </div>

            </div>

          </div>

          <Link
            href="/reports/ai"
            className="rounded-2xl border border-violet-500/20 bg-black/30 px-5 py-3 text-sm text-violet-300"
          >

            Open Reporting Intelligence

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-violet-400" />

          <input
            placeholder="Ask reporting AI to analyze operations, generate forecasts or build enterprise reports..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-violet-500 px-6 py-3 font-medium text-white">

            Run

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {QUICK_ACTIONS.map((action) => (

            <button
              key={action}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-white"
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

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-500/10">

                    <Icon className="h-8 w-8 text-violet-400" />

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
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-violet-500/40 hover:bg-violet-500/5"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-violet-400" />

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
