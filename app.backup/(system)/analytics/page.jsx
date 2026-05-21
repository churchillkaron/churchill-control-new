"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  Briefcase,
  DollarSign,
  Factory,
  FileBarChart,
  Gauge,
  Globe2,
  LineChart,
  Radar,
  Receipt,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";

const ANALYTICS_SECTIONS = [

  {
    title: "Enterprise Analytics",
    description:
      "Global enterprise visibility, executive metrics and realtime business intelligence.",
    icon: Globe2,
    items: [
      {
        name: "Enterprise Overview",
        route: "/analytics/overview",
      },
      {
        name: "Realtime Metrics",
        route: "/analytics/live",
      },
      {
        name: "Executive KPIs",
        route: "/analytics/kpis",
      },
      {
        name: "Enterprise Health",
        route: "/analytics/health",
      },
    ],
  },

  {
    title: "Operational Analytics",
    description:
      "Execution analytics, service timing, operational bottlenecks and runtime performance.",
    icon: Activity,
    items: [
      {
        name: "Operations Analytics",
        route: "/analytics/operations",
      },
      {
        name: "Kitchen Analytics",
        route: "/analytics/kitchen",
      },
      {
        name: "Service Timing",
        route: "/analytics/service",
      },
      {
        name: "Workflow Analytics",
        route: "/analytics/workflows",
      },
      {
        name: "Operational Efficiency",
        route: "/analytics/efficiency",
      },
    ],
  },

  {
    title: "Financial Analytics",
    description:
      "Revenue intelligence, profitability analytics, financial performance and cost visibility.",
    icon: DollarSign,
    items: [
      {
        name: "Financial Analytics",
        route: "/analytics/finance",
      },
      {
        name: "Revenue Intelligence",
        route: "/analytics/revenue",
      },
      {
        name: "Profitability",
        route: "/analytics/profitability",
      },
      {
        name: "Cashflow Analytics",
        route: "/analytics/cashflow",
      },
      {
        name: "Cost Analytics",
        route: "/analytics/costs",
      },
    ],
  },

  {
    title: "Workforce Analytics",
    description:
      "Staffing analytics, workforce performance, labor cost and attendance intelligence.",
    icon: Users,
    items: [
      {
        name: "Workforce Analytics",
        route: "/analytics/workforce",
      },
      {
        name: "Attendance Analytics",
        route: "/analytics/attendance",
      },
      {
        name: "Labor Cost",
        route: "/analytics/labor",
      },
      {
        name: "Performance Metrics",
        route: "/analytics/performance",
      },
      {
        name: "Scheduling Intelligence",
        route: "/analytics/scheduling",
      },
    ],
  },

  {
    title: "Inventory & Production Analytics",
    description:
      "Inventory movement, production costing, usage analytics and procurement visibility.",
    icon: Factory,
    items: [
      {
        name: "Inventory Analytics",
        route: "/analytics/inventory",
      },
      {
        name: "Production Analytics",
        route: "/analytics/production",
      },
      {
        name: "Usage Analytics",
        route: "/analytics/usage",
      },
      {
        name: "Waste Analytics",
        route: "/analytics/waste",
      },
      {
        name: "Procurement Analytics",
        route: "/analytics/procurement",
      },
    ],
  },

  {
    title: "Customer & Sales Analytics",
    description:
      "Customer intelligence, order trends, sales analytics and behavioral analysis.",
    icon: ShoppingCart,
    items: [
      {
        name: "Sales Analytics",
        route: "/analytics/sales",
      },
      {
        name: "Customer Analytics",
        route: "/analytics/customers",
      },
      {
        name: "Order Intelligence",
        route: "/analytics/orders",
      },
      {
        name: "Behavior Analytics",
        route: "/analytics/behavior",
      },
      {
        name: "Retention Analytics",
        route: "/analytics/retention",
      },
    ],
  },

  {
    title: "AI & Predictive Analytics",
    description:
      "Forecasting, predictive intelligence, anomaly detection and AI-driven analytics.",
    icon: Brain,
    items: [
      {
        name: "Predictive Analytics",
        route: "/analytics/predictive",
      },
      {
        name: "Forecasting",
        route: "/analytics/forecasting",
      },
      {
        name: "Anomaly Analytics",
        route: "/analytics/anomalies",
      },
      {
        name: "Optimization Intelligence",
        route: "/analytics/optimization",
      },
      {
        name: "AI Runtime",
        route: "/analytics/ai",
      },
    ],
  },

  {
    title: "Reporting & Benchmarking",
    description:
      "Executive reporting, benchmarking, variance analysis and enterprise visibility.",
    icon: FileBarChart,
    items: [
      {
        name: "Executive Reports",
        route: "/analytics/reports",
      },
      {
        name: "Benchmarking",
        route: "/analytics/benchmarking",
      },
      {
        name: "Variance Analysis",
        route: "/analytics/variance",
      },
      {
        name: "Comparative Analytics",
        route: "/analytics/comparison",
      },
      {
        name: "Strategic Reporting",
        route: "/analytics/strategy",
      },
    ],
  },

];

const RUNTIME_STATUS = [

  {
    label: "Analytics",
    value: "ACTIVE",
    icon: BarChart3,
  },

  {
    label: "Realtime Metrics",
    value: "ONLINE",
    icon: Gauge,
  },

  {
    label: "Predictive AI",
    value: "ARMED",
    icon: Brain,
  },

  {
    label: "Forecasting",
    value: "READY",
    icon: TrendingUp,
  },

];

const AI_ACTIONS = [

  "Analyze enterprise performance",
  "Forecast next 30 days",
  "Detect KPI anomalies",
  "Analyze profitability trends",
  "Review workforce metrics",
  "Generate executive analytics summary",

];

export default function AnalyticsPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      {/* HERO */}

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10">

            <BarChart3 className="h-5 w-5 text-cyan-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400">

            Churchill Enterprise Analytics Runtime

          </div>

        </div>

        <div className="mb-5 flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Analytics

            </h1>

            <p className="max-w-4xl text-lg leading-relaxed text-white/50">

              Enterprise analytics runtime for visibility, forecasting,
              KPI intelligence, benchmarking and strategic measurement.

            </p>

          </div>

          <Link
            href="/analytics/live"
            className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-5 py-4 text-sm font-medium text-cyan-300 transition-all hover:bg-cyan-500/20"
          >

            Open Analytics Runtime

          </Link>

        </div>

      </div>

      {/* STATUS */}

      <div className="mb-10 grid grid-cols-4 gap-6">

        {RUNTIME_STATUS.map(
          stat => {

            const Icon =
              stat.icon;

            return (

              <div
                key={stat.label}
                className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
              >

                <Icon className="mb-5 h-8 w-8 text-cyan-400" />

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

      {/* ANALYTICS AI */}

      <div className="mb-10 rounded-[40px] border border-cyan-500/20 bg-cyan-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-500/10">

              <Sparkles className="h-8 w-8 text-cyan-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Analytics AI Command

              </div>

              <div className="text-white/40">

                Ask Churchill AI to analyze metrics, trends, anomalies or forecasts.

              </div>

            </div>

          </div>

          <Link
            href="/analytics/ai"
            className="rounded-2xl border border-cyan-500/20 bg-black/30 px-5 py-3 text-sm text-cyan-300 hover:bg-cyan-500/10"
          >

            Open Analytics AI

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-cyan-400" />

          <input
            placeholder="Ask AI to analyze trends, KPIs, forecasts or operational performance..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-cyan-500 px-6 py-3 font-medium text-white transition-all hover:bg-cyan-400">

            Analyze

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {AI_ACTIONS.map(
            action => (

              <button
                key={action}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 transition-all hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-white"
              >

                {action}

              </button>

            )
          )}

        </div>

      </div>

      {/* ANALYTICS SECTIONS */}

      <div className="grid grid-cols-2 gap-6">

        {ANALYTICS_SECTIONS.map(
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

                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-cyan-500/10">

                      <Icon className="h-8 w-8 text-cyan-400" />

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

                    Analytics

                  </div>

                </div>

                <div className="grid grid-cols-2 gap-3">

                  {section.items.map(
                    item => (

                      <Link
                        key={item.route}
                        href={item.route}
                        className="group rounded-2xl border border-white/10 bg-black/30 p-4 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/5"
                      >

                        <div className="flex items-center justify-between gap-3">

                          <div className="text-white/70">

                            {item.name}

                          </div>

                          <ArrowRight className="h-4 w-4 text-white/20 transition-all group-hover:translate-x-1 group-hover:text-cyan-400" />

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

      {/* LOWER STRIP */}

      <div className="mt-10 grid grid-cols-4 gap-6">

        <Link
          href="/analytics/revenue"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
        >

          <DollarSign className="mb-5 h-8 w-8 text-emerald-400" />

          <div className="mb-2 text-2xl font-light">

            Revenue

          </div>

          <div className="text-sm text-white/40">

            Revenue intelligence and profitability visibility.

          </div>

        </Link>

        <Link
          href="/analytics/predictive"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-violet-500/40 hover:bg-violet-500/5"
        >

          <Radar className="mb-5 h-8 w-8 text-violet-400" />

          <div className="mb-2 text-2xl font-light">

            Predictive

          </div>

          <div className="text-sm text-white/40">

            Forecasting and predictive enterprise analytics.

          </div>

        </Link>

        <Link
          href="/analytics/workforce"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-pink-500/40 hover:bg-pink-500/5"
        >

          <Users className="mb-5 h-8 w-8 text-pink-400" />

          <div className="mb-2 text-2xl font-light">

            Workforce

          </div>

          <div className="text-sm text-white/40">

            Workforce metrics and labor intelligence.

          </div>

        </Link>

        <Link
          href="/analytics/anomalies"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-red-500/40 hover:bg-red-500/5"
        >

          <AlertTriangle className="mb-5 h-8 w-8 text-red-400" />

          <div className="mb-2 text-2xl font-light">

            Anomalies

          </div>

          <div className="text-sm text-white/40">

            Risk detection and anomaly intelligence runtime.

          </div>

        </Link>

      </div>

    </main>

  );

}
