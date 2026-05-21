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
  Building2,
  Building,
  Briefcase,
  Crown,
  DollarSign,
  Factory,
  Globe2,
  Landmark,
  LineChart,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  Workflow,
} from "lucide-react";

const OWNER_SECTIONS = [

  {
    title: "Enterprise Overview",
    description:
      "Global enterprise visibility across operations, finance, growth and ownership.",
    icon: Crown,
    items: [
      {
        name: "Owner Overview",
        route: "/owner/overview",
      },
      {
        name: "Enterprise Runtime",
        route: "/owner/live",
      },
      {
        name: "Global KPIs",
        route: "/owner/kpis",
      },
      {
        name: "Executive Health",
        route: "/owner/health",
      },
    ],
  },

  {
    title: "Holdings & Portfolio",
    description:
      "Multi-company portfolio control, entity governance and ownership structure.",
    icon: Building2,
    items: [
      {
        name: "Holdings",
        route: "/owner/holdings",
      },
      {
        name: "Entities",
        route: "/owner/entities",
      },
      {
        name: "Portfolio Analytics",
        route: "/owner/portfolio",
      },
      {
        name: "Multi-Location",
        route: "/owner/locations",
      },
      {
        name: "Brand Runtime",
        route: "/owner/brands",
      },
    ],
  },

  {
    title: "Financial Ownership",
    description:
      "Ownership-level profitability, enterprise cashflow and investment intelligence.",
    icon: DollarSign,
    items: [
      {
        name: "Enterprise Finance",
        route: "/finance",
      },
      {
        name: "Profitability Matrix",
        route: "/owner/profitability",
      },
      {
        name: "Cashflow Runtime",
        route: "/owner/cashflow",
      },
      {
        name: "Investment Analysis",
        route: "/owner/investments",
      },
      {
        name: "Capital Allocation",
        route: "/owner/capital",
      },
    ],
  },

  {
    title: "Expansion & Strategy",
    description:
      "Expansion planning, acquisitions, strategic growth and enterprise scaling.",
    icon: TrendingUp,
    items: [
      {
        name: "Expansion Planning",
        route: "/owner/expansion",
      },
      {
        name: "Acquisitions",
        route: "/owner/acquisitions",
      },
      {
        name: "Market Analysis",
        route: "/owner/markets",
      },
      {
        name: "Strategic Forecasting",
        route: "/owner/forecasting",
      },
      {
        name: "Scenario Planning",
        route: "/owner/scenarios",
      },
    ],
  },

  {
    title: "Operations Oversight",
    description:
      "Ownership-level visibility into operations, production and execution performance.",
    icon: Activity,
    items: [
      {
        name: "Operations Runtime",
        route: "/operations",
      },
      {
        name: "Production Runtime",
        route: "/production",
      },
      {
        name: "Inventory Runtime",
        route: "/inventory",
      },
      {
        name: "Enterprise Monitoring",
        route: "/owner/monitoring",
      },
      {
        name: "Risk Runtime",
        route: "/owner/risk",
      },
    ],
  },

  {
    title: "Workforce & Leadership",
    description:
      "Leadership runtime, workforce intelligence and executive accountability.",
    icon: Briefcase,
    items: [
      {
        name: "Leadership",
        route: "/owner/leadership",
      },
      {
        name: "Executive Performance",
        route: "/owner/executives",
      },
      {
        name: "Workforce Analytics",
        route: "/staff/analytics",
      },
      {
        name: "Compensation Oversight",
        route: "/owner/compensation",
      },
      {
        name: "Organization Structure",
        route: "/owner/organization",
      },
    ],
  },

  {
    title: "AI Owner Intelligence",
    description:
      "Enterprise AI intelligence, forecasting, optimization and owner copilot.",
    icon: Brain,
    items: [
      {
        name: "Owner AI",
        route: "/owner/ai",
      },
      {
        name: "Enterprise Forecasting",
        route: "/owner/forecasting",
      },
      {
        name: "AI Recommendations",
        route: "/owner/recommendations",
      },
      {
        name: "Strategic Intelligence",
        route: "/owner/intelligence",
      },
      {
        name: "Predictive Runtime",
        route: "/owner/predictive",
      },
    ],
  },

  {
    title: "Investor & Governance",
    description:
      "Investor visibility, governance, compliance and enterprise audit control.",
    icon: ShieldCheck,
    items: [
      {
        name: "Investor Runtime",
        route: "/owner/investors",
      },
      {
        name: "Board Runtime",
        route: "/owner/board",
      },
      {
        name: "Governance",
        route: "/owner/governance",
      },
      {
        name: "Compliance",
        route: "/owner/compliance",
      },
      {
        name: "Audit Runtime",
        route: "/owner/audit",
      },
    ],
  },

];

const RUNTIME_STATUS = [

  {
    label: "Enterprise",
    value: "ACTIVE",
    icon: Globe2,
  },

  {
    label: "Holdings",
    value: "ONLINE",
    icon: Building,
  },

  {
    label: "Investment AI",
    value: "ARMED",
    icon: Brain,
  },

  {
    label: "Governance",
    value: "READY",
    icon: ShieldCheck,
  },

];

const AI_ACTIONS = [

  "Analyze enterprise profitability",
  "Forecast expansion opportunities",
  "Review enterprise risks",
  "Analyze multi-location performance",
  "Review investment allocation",
  "Generate owner summary",

];

export default function OwnerPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      {/* HERO */}

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/10">

            <Crown className="h-5 w-5 text-violet-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-violet-400">

            Churchill Owner Operating System

          </div>

        </div>

        <div className="mb-5 flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Owner

            </h1>

            <p className="max-w-4xl text-lg leading-relaxed text-white/50">

              Enterprise ownership runtime for holdings, strategy, investment,
              profitability, expansion and executive intelligence.

            </p>

          </div>

          <Link
            href="/owner/live"
            className="rounded-2xl border border-violet-500/20 bg-violet-500/10 px-5 py-4 text-sm font-medium text-violet-300 transition-all hover:bg-violet-500/20"
          >

            Open Owner Runtime

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

      {/* OWNER AI */}

      <div className="mb-10 rounded-[40px] border border-violet-500/20 bg-violet-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-500/10">

              <Sparkles className="h-8 w-8 text-violet-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Owner AI Command

              </div>

              <div className="text-white/40">

                Ask Churchill AI to analyze enterprise growth, profitability or ownership risk.

              </div>

            </div>

          </div>

          <Link
            href="/owner/ai"
            className="rounded-2xl border border-violet-500/20 bg-black/30 px-5 py-3 text-sm text-violet-300 hover:bg-violet-500/10"
          >

            Open Owner AI

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-violet-400" />

          <input
            placeholder="Ask AI to analyze enterprise profitability, growth, investments or expansion..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-violet-500 px-6 py-3 font-medium text-white transition-all hover:bg-violet-400">

            Execute

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

      {/* OWNER SECTIONS */}

      <div className="grid grid-cols-2 gap-6">

        {OWNER_SECTIONS.map(
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

                    Ownership

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

      {/* LOWER STRIP */}

      <div className="mt-10 grid grid-cols-4 gap-6">

        <Link
          href="/owner/profitability"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-violet-500/40 hover:bg-violet-500/5"
        >

          <Wallet className="mb-5 h-8 w-8 text-violet-400" />

          <div className="mb-2 text-2xl font-light">

            Profitability

          </div>

          <div className="text-sm text-white/40">

            Enterprise profitability and ownership analytics.

          </div>

        </Link>

        <Link
          href="/owner/expansion"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/5"
        >

          <LineChart className="mb-5 h-8 w-8 text-cyan-400" />

          <div className="mb-2 text-2xl font-light">

            Expansion

          </div>

          <div className="text-sm text-white/40">

            Growth, expansion and acquisition planning.

          </div>

        </Link>

        <Link
          href="/owner/investors"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
        >

          <Landmark className="mb-5 h-8 w-8 text-emerald-400" />

          <div className="mb-2 text-2xl font-light">

            Investors

          </div>

          <div className="text-sm text-white/40">

            Investor governance and enterprise reporting.

          </div>

        </Link>

        <Link
          href="/owner/risk"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-red-500/40 hover:bg-red-500/5"
        >

          <AlertTriangle className="mb-5 h-8 w-8 text-red-400" />

          <div className="mb-2 text-2xl font-light">

            Risk

          </div>

          <div className="text-sm text-white/40">

            Enterprise risk and governance runtime.

          </div>

        </Link>

      </div>

    </main>

  );

}
