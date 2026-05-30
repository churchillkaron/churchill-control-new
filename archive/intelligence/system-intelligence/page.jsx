"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  Cpu,
  Database,
  FileSearch,
  LineChart,
  MessageSquare,
  Network,
  Radio,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
  Zap,
} from "lucide-react";

const INTELLIGENCE_SECTIONS = [

  {
    title: "AI Runtime Overview",
    description:
      "Main enterprise intelligence cockpit, AI runtime state and orchestration health.",
    icon: Brain,
    items: [
      {
        name: "Intelligence Overview",
        route: "/intelligence/live",
      },
      {
        name: "AI Orchestrator",
        route: "/intelligence/orchestrator",
      },
      {
        name: "AI Runtime Stream",
        route: "/intelligence/stream",
      },
      {
        name: "AI Governance",
        route: "/intelligence/governance",
      },
    ],
  },

  {
    title: "AI Chat & Command",
    description:
      "Realtime AI chat, copilot, commands and execution interface.",
    icon: MessageSquare,
    items: [
      {
        name: "AI Chat",
        route: "/intelligence/chat",
      },
      {
        name: "Copilot",
        route: "/intelligence/copilot",
      },
      {
        name: "Command",
        route: "/intelligence/command",
      },
      {
        name: "Execution",
        route: "/intelligence/execution",
      },
    ],
  },

  {
    title: "Agents & Automation",
    description:
      "AI agents, workflow execution, scheduling, automation and autonomous runtime.",
    icon: Bot,
    items: [
      {
        name: "Agents",
        route: "/intelligence/agents",
      },
      {
        name: "Workflows",
        route: "/intelligence/workflows",
      },
      {
        name: "Scheduler",
        route: "/intelligence/scheduler",
      },
      {
        name: "Automation",
        route: "/intelligence/automation",
      },
      {
        name: "Autonomy",
        route: "/intelligence/autonomy",
      },
    ],
  },

  {
    title: "Memory & Knowledge",
    description:
      "Semantic memory, vector search, learning engine and enterprise context.",
    icon: Database,
    items: [
      {
        name: "Semantic Search",
        route: "/intelligence/semantic",
      },
      {
        name: "Vector Memory",
        route: "/intelligence/vector",
      },
      {
        name: "Learning Engine",
        route: "/intelligence/learning",
      },
      {
        name: "Optimization",
        route: "/intelligence/optimization",
      },
    ],
  },

  {
    title: "Forecasting & Predictions",
    description:
      "Predictive intelligence, demand forecasting, staffing and financial projections.",
    icon: LineChart,
    items: [
      {
        name: "Forecasting",
        route: "/intelligence/forecasting",
      },
      {
        name: "Demand",
        route: "/intelligence/demand",
      },
      {
        name: "Staffing",
        route: "/intelligence/staffing",
      },
      {
        name: "Revenue",
        route: "/intelligence/revenue",
      },
      {
        name: "Simulation",
        route: "/intelligence/simulation",
      },
    ],
  },

  {
    title: "Risk & Anomaly Detection",
    description:
      "Anomaly detection, compliance, enforcement, risk monitoring and self-healing.",
    icon: AlertTriangle,
    items: [
      {
        name: "Anomaly Detection",
        route: "/intelligence/anomaly",
      },
      {
        name: "Compliance",
        route: "/intelligence/compliance",
      },
      {
        name: "Enforcement",
        route: "/intelligence/enforcement",
      },
      {
        name: "Self Healing",
        route: "/intelligence/healing",
      },
    ],
  },

  {
    title: "Business Intelligence Domains",
    description:
      "AI intelligence connected to finance, operations, procurement, payroll and production.",
    icon: Target,
    items: [
      {
        name: "Operations AI",
        route: "/intelligence/operations",
      },
      {
        name: "Finance AI",
        route: "/intelligence/finance",
      },
      {
        name: "Procurement AI",
        route: "/intelligence/procurement",
      },
      {
        name: "Inventory AI",
        route: "/intelligence/inventory",
      },
      {
        name: "Production AI",
        route: "/intelligence/production",
      },
      {
        name: "Payroll AI",
        route: "/intelligence/payroll",
      },
    ],
  },

  {
    title: "Executive & Strategy",
    description:
      "Executive intelligence, board views, strategic planning and owner operating system.",
    icon: ShieldCheck,
    items: [
      {
        name: "Executive AI",
        route: "/intelligence/executive",
      },
      {
        name: "Owner OS",
        route: "/intelligence/owneros",
      },
      {
        name: "Board",
        route: "/intelligence/board",
      },
      {
        name: "Strategy",
        route: "/intelligence/strategy",
      },
      {
        name: "Investor",
        route: "/intelligence/investor",
      },
    ],
  },

];

const RUNTIME_STATUS = [

  {
    label: "AI Runtime",
    value: "ACTIVE",
    icon: Brain,
  },

  {
    label: "Agents",
    value: "ONLINE",
    icon: Bot,
  },

  {
    label: "Memory",
    value: "STABLE",
    icon: Database,
  },

  {
    label: "Execution",
    value: "READY",
    icon: Zap,
  },

];

const AI_ACTIONS = [

  "Analyze full business health",
  "Detect anomalies across all systems",
  "Forecast next 30 days",
  "Run executive summary",
  "Review operational risks",
  "Optimize staff and cost structure",

];

export default function IntelligencePage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      {/* HERO */}

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10">

            <Brain className="h-5 w-5 text-cyan-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400">

            Churchill Enterprise Intelligence Runtime

          </div>

        </div>

        <div className="mb-5 flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Intelligence

            </h1>

            <p className="max-w-4xl text-lg leading-relaxed text-white/50">

              Enterprise AI runtime for orchestration, agents, forecasting,
              automation, anomaly detection, memory, semantic intelligence and AI execution.

            </p>

          </div>

          <Link
            href="/intelligence/chat"
            className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-5 py-4 text-sm font-medium text-cyan-300 transition-all hover:bg-cyan-500/20"
          >

            Open AI Chat

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

      {/* AI COMMAND */}

      <div className="mb-10 rounded-[40px] border border-cyan-500/20 bg-cyan-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-500/10">

              <Sparkles className="h-8 w-8 text-cyan-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Intelligence Command

              </div>

              <div className="text-white/40">

                Ask Churchill AI to analyze, forecast, orchestrate, investigate or execute.

              </div>

            </div>

          </div>

          <Link
            href="/command"
            className="rounded-2xl border border-cyan-500/20 bg-black/30 px-5 py-3 text-sm text-cyan-300 hover:bg-cyan-500/10"
          >

            Open Command Center

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Cpu className="h-6 w-6 text-cyan-400" />

          <input
            placeholder="Ask AI to analyze business health, forecast, detect anomalies or execute workflows..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-cyan-500 px-6 py-3 font-medium text-white transition-all hover:bg-cyan-400">

            Execute

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

      {/* INTELLIGENCE SECTIONS */}

      <div className="grid grid-cols-2 gap-6">

        {INTELLIGENCE_SECTIONS.map(
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

                    AI Runtime

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
          href="/intelligence/chat"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/5"
        >

          <MessageSquare className="mb-5 h-8 w-8 text-cyan-400" />

          <div className="mb-2 text-2xl font-light">

            AI Chat

          </div>

          <div className="text-sm text-white/40">

            Realtime conversational AI control layer.

          </div>

        </Link>

        <Link
          href="/intelligence/orchestration"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-violet-500/40 hover:bg-violet-500/5"
        >

          <Workflow className="mb-5 h-8 w-8 text-violet-400" />

          <div className="mb-2 text-2xl font-light">

            Orchestration

          </div>

          <div className="text-sm text-white/40">

            AI workflow and execution orchestration.

          </div>

        </Link>

        <Link
          href="/intelligence/realtime"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
        >

          <Radio className="mb-5 h-8 w-8 text-emerald-400" />

          <div className="mb-2 text-2xl font-light">

            Realtime

          </div>

          <div className="text-sm text-white/40">

            Live AI monitoring and runtime events.

          </div>

        </Link>

        <Link
          href="/intelligence/anomaly"
          className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-red-500/40 hover:bg-red-500/5"
        >

          <Radar className="mb-5 h-8 w-8 text-red-400" />

          <div className="mb-2 text-2xl font-light">

            Anomalies

          </div>

          <div className="text-sm text-white/40">

            Risk detection and abnormal pattern monitoring.

          </div>

        </Link>

      </div>

    </main>

  );

}
