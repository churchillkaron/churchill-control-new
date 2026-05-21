"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileWarning,
  Gavel,
  Landmark,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
} from "lucide-react";

const MANAGEMENT_SECTIONS = [

  {
    title: "Executive Overview",
    description:
      "Enterprise executive overview, realtime governance and operational health.",
    icon: Landmark,
    items: [
      {
        name: "Executive Overview",
        route: "/management/overview",
      },
      {
        name: "Live Governance",
        route: "/management/live",
      },
      {
        name: "Executive KPIs",
        route: "/management/kpis",
      },
      {
        name: "Enterprise Health",
        route: "/management/health",
      },
    ],
  },

  {
    title: "Approvals & Governance",
    description:
      "Approval runtime for payroll, procurement, finance and enterprise workflows.",
    icon: ClipboardCheck,
    items: [
      {
        name: "Approvals",
        route: "/management/approvals",
      },
      {
        name: "Payroll Approval",
        route: "/management/payroll",
      },
      {
        name: "Procurement Approval",
        route: "/management/procurement",
      },
      {
        name: "Financial Approval",
        route: "/management/finance",
      },
      {
        name: "Approval Queue",
        route: "/management/queue",
      },
    ],
  },

  {
    title: "Performance & Accountability",
    description:
      "Department performance, penalties, productivity and workforce governance.",
    icon: Target,
    items: [
      {
        name: "Performance Runtime",
        route: "/management/performance",
      },
      {
        name: "Department KPIs",
        route: "/performance/departments",
      },
      {
        name: "Attendance Governance",
        route: "/management/attendance",
      },
      {
        name: "Penalty Engine",
        route: "/management/penalties",
      },
      {
        name: "Salary Review",
        route: "/management/salary-review",
      },
    ],
  },

  {
    title: "Operations Oversight",
    description:
      "Realtime operational supervision, bottlenecks and execution governance.",
    icon: Activity,
    items: [
      {
        name: "Operations Control",
        route: "/operations",
      },
      {
        name: "Kitchen Governance",
        route: "/management/kitchen",
      },
      {
        name: "Inventory Oversight",
        route: "/management/inventory",
      },
      {
        name: "Production Oversight",
        route: "/management/production",
      },
      {
        name: "Incident Review",
        route: "/management/incidents",
      },
    ],
  },

  {
    title: "Financial Governance",
    description:
      "Management oversight for accounting, finance health, cost control and profitability.",
    icon: BarChart3,
    items: [
      {
        name: "Financial Runtime",
        route: "/finance",
      },
      {
        name: "P&L Review",
        route: "/management/pl",
      },
      {
        name: "Cost Governance",
        route: "/management/costs",
      },
      {
        name: "Budget Oversight",
        route: "/management/budget",
      },
      {
        name: "Cashflow Oversight",
        route: "/management/cashflow",
      },
    ],
  },

  {
    title: "Compliance & Audit",
    description:
      "Audit review, compliance enforcement, governance and investigation workflows.",
    icon: ShieldCheck,
    items: [
      {
        name: "Audit Runtime",
        route: "/management/audit",
      },
      {
        name: "Compliance",
        route: "/management/compliance",
      },
      {
        name: "Investigations",
        route: "/management/investigations",
      },
      {
        name: "Violations",
        route: "/management/violations",
      },
      {
        name: "Risk Review",
        route: "/management/risk",
      },
    ],
  },

  {
    title: "Executive Intelligence",
    description:
      "AI management intelligence, strategic recommendations and executive forecasting.",
    icon: Bot,
    items: [
      {
        name: "Executive AI",
        route: "/management/ai",
      },
      {
        name: "Strategic Planning",
        route: "/management/strategy",
      },
      {
        name: "Forecasting",
        route: "/management/forecasting",
      },
      {
        name: "AI Recommendations",
        route: "/management/recommendations",
      },
      {
        name: "Scenario Analysis",
        route: "/management/scenarios",
      },
    ],
  },

  {
    title: "Enterprise Command",
    description:
      "Central executive runtime for escalations, command decisions and enterprise control.",
    icon: Workflow,
    items: [
      {
        name: "Command Center",
        route: "/management/command",
      },
      {
        name: "Escalations",
        route: "/management/escalations",
      },
      {
        name: "Enterprise Control",
        route: "/management/control",
      },
      {
        name: "Board Runtime",
        route: "/management/board",
      },
      {
        name: "Ownership Runtime",
        route: "/management/ownership",
      },
    ],
  },

];

const RUNTIME_STATUS = [

  {
    label: "Governance",
    value: "ACTIVE",
    icon: ShieldCheck,
  },

  {
    label: "Approvals",
    value: "ONLINE",
    icon: ClipboardCheck,
  },

  {
    label: "Executive AI",
    value: "ARMED",
    icon: Bot,
  },

  {
    label: "Audit Runtime",
    value: "READY",
    icon: Eye,
  },

];

const AI_ACTIONS = [

  "Review enterprise health",
  "Analyze department performance",
  "Detect operational risks",
  "Review financial governance",
  "Forecast staffing risks",
  "Generate executive summary",

];

export default function ManagementPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      {/* HERO */}

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10">

            <Briefcase className="h-5 w-5 text-amber-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-amber-400">

            Churchill Executive Management Runtime

          </div>

        </div>

        <div className="mb-5 flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Management

            </h1>

            <p className="max-w-4xl text-lg leading-relaxed text-white/50">

              Enterprise governance runtime for approvals, accountability,
              executive oversight, compliance, strategy and operational control.

            </p>

          </div>

          <Link
            href="/management/live"
            className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm font-medium text-amber-300 transition-all hover:bg-amber-500/20"
          >

            Open Executive Runtime

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

                <Icon className="mb-5 h-8 w-8 text-amber-400" />

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

      {/* EXECUTIVE AI */}

      <div className="mb-10 rounded-[40px] border border-amber-500/20 bg-amber-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-500/10">

              <Sparkles className="h-8 w-8 text-amber-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Executive AI Command

              </div>

              <div className="text-white/40">

                Ask Churchill AI to review enterprise health, governance, risks or approvals.

              </div>

            </div>

          </div>

          <Link
            href="/management/command"
            className="rounded-2xl border border-amber-500/20 bg-black/30 px-5 py-3 text-sm text-amber-300 hover:bg-amber-500/10"
          >

            Open Executive Command

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-amber-400" />

          <input
            placeholder="Ask AI to review approvals, governance, risks, departments or enterprise performance..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-amber-500 px-6 py-3 font-medium text-white transition-all hover:bg-amber-400">

            Execute

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {AI_ACTIONS.map(
            action => (

              <button
                key={action}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 transition-all hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-white"
              >

                {action}

              </button>

            )
          )}

        </div>

      </div>

      {/* MANAGEMENT SECTIONS */}

      <div className="grid grid-cols-2 gap-6">

        {MANAGEMENT_SECTIONS.map(
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

                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-amber-500/10">

                      <Icon className="h-8 w-8 text-amber-400" />

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

                    Governance

                  </div>

                </div>

                <div className="grid grid-cols-2 gap-3">

                  {section.items.map(
                    item => (

                      <Link
                        key={item.route}
                        href={item.route}
                        className="group rounded-2xl border border-white/10 bg-black/30 p-4 transition-all hover:border-amber-500/40 hover:bg-amber-500/5"
                      >

                        <div className="flex items-center justify-between gap-3">

                          <div className="text-white/70">

                            {item.name}

                          </div>

                          <ArrowRight className="h-4 w-4 text-white/20 transition-all group-hover:translate-x-1 group-hover:text-amber-400" />

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
          href="/management/approvals"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-amber-500/40 hover:bg-amber-500/5"
        >

          <CheckCircle2 className="mb-5 h-8 w-8 text-amber-400" />

          <div className="mb-2 text-2xl font-light">

            Approvals

          </div>

          <div className="text-sm text-white/40">

            Enterprise approval and workflow runtime.

          </div>

        </Link>

        <Link
          href="/management/audit"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-red-500/40 hover:bg-red-500/5"
        >

          <FileWarning className="mb-5 h-8 w-8 text-red-400" />

          <div className="mb-2 text-2xl font-light">

            Audit

          </div>

          <div className="text-sm text-white/40">

            Compliance, investigations and governance.

          </div>

        </Link>

        <Link
          href="/management/strategy"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/5"
        >

          <Building2 className="mb-5 h-8 w-8 text-cyan-400" />

          <div className="mb-2 text-2xl font-light">

            Strategy

          </div>

          <div className="text-sm text-white/40">

            Executive planning and strategic oversight.

          </div>

        </Link>

        <Link
          href="/management/control"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-violet-500/40 hover:bg-violet-500/5"
        >

          <Gavel className="mb-5 h-8 w-8 text-violet-400" />

          <div className="mb-2 text-2xl font-light">

            Command

          </div>

          <div className="text-sm text-white/40">

            Executive command and enterprise enforcement.

          </div>

        </Link>

      </div>

    </main>

  );

}
