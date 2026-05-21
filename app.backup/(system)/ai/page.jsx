"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  Briefcase,
  Building2,
  Cpu,
  Database,
  Factory,
  LayoutDashboard,
  LineChart,
  MessageSquare,
  Network,
  Radar,
  Server,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

const SECTIONS = [

  {
    title: "AI Overview",
    description:
      "Main enterprise AI command center and cross-system intelligence runtime.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/ai/overview" },
      { name: "Live Runtime", route: "/ai/live" },
      { name: "AI Dashboard", route: "/ai/dashboard" },
      { name: "AI Health", route: "/ai/health" },
    ],
  },

  {
    title: "Executive Intelligence",
    description:
      "Executive reasoning, strategic intelligence and enterprise-level AI analysis.",
    icon: Briefcase,
    items: [
      { name: "Executive Intelligence", route: "/ai/executive" },
      { name: "Strategic Analysis", route: "/ai/strategy" },
      { name: "Business Forecasting", route: "/ai/forecasting" },
      { name: "Executive Recommendations", route: "/ai/recommendations" },
      { name: "Board Intelligence", route: "/ai/board" },
    ],
  },

  {
    title: "Operational Intelligence",
    description:
      "Operational reasoning, realtime runtime monitoring and workflow intelligence.",
    icon: Workflow,
    items: [
      { name: "Operations AI", route: "/ai/operations" },
      { name: "Realtime Intelligence", route: "/ai/realtime" },
      { name: "Workflow Decisions", route: "/ai/workflows" },
      { name: "Operational Analysis", route: "/ai/analysis" },
      { name: "Performance Runtime", route: "/ai/performance" },
    ],
  },

  {
    title: "Financial Intelligence",
    description:
      "Financial reasoning, anomaly detection and enterprise financial AI runtime.",
    icon: LineChart,
    items: [
      { name: "Financial Intelligence", route: "/ai/finance" },
      { name: "Profitability AI", route: "/ai/profitability" },
      { name: "Cost Analysis", route: "/ai/costs" },
      { name: "Financial Forecasting", route: "/ai/financial-forecasting" },
      { name: "Anomaly Detection", route: "/ai/anomalies" },
    ],
  },

  {
    title: "Customer & Marketing AI",
    description:
      "Customer intelligence, campaign reasoning and engagement optimization.",
    icon: Users,
    items: [
      { name: "Customer Intelligence", route: "/ai/customer" },
      { name: "Marketing Intelligence", route: "/ai/marketing" },
      { name: "Campaign Optimization", route: "/ai/campaigns" },
      { name: "Retention Intelligence", route: "/ai/retention" },
      { name: "Audience Analysis", route: "/ai/audiences" },
    ],
  },

  {
    title: "Production & Inventory AI",
    description:
      "Production forecasting, inventory optimization and operational intelligence.",
    icon: Factory,
    items: [
      { name: "Production Intelligence", route: "/ai/production" },
      { name: "Inventory Intelligence", route: "/ai/inventory" },
      { name: "Food Cost AI", route: "/ai/food-cost" },
      { name: "Demand Forecasting", route: "/ai/demand" },
      { name: "Supply Optimization", route: "/ai/supply" },
    ],
  },

  {
    title: "Predictive Runtime",
    description:
      "Prediction engines, forecasting systems and enterprise modeling runtime.",
    icon: Radar,
    items: [
      { name: "Predictive Runtime", route: "/ai/predictive" },
      { name: "Forecast Engine", route: "/ai/forecast-engine" },
      { name: "Trend Prediction", route: "/ai/trends" },
      { name: "Risk Prediction", route: "/ai/risk" },
      { name: "Predictive Models", route: "/ai/models" },
    ],
  },

  {
    title: "AI Automation & Decisions",
    description:
      "AI execution, autonomous workflows and enterprise decision runtime.",
    icon: Zap,
    items: [
      { name: "AI Automation", route: "/ai/automation" },
      { name: "Decision Engine", route: "/ai/decisions" },
      { name: "AI Workflows", route: "/ai/ai-workflows" },
      { name: "Execution Runtime", route: "/ai/execution" },
      { name: "Autonomous Actions", route: "/ai/actions" },
    ],
  },

  {
    title: "AI Memory & Agents",
    description:
      "AI memory systems, agent runtime and enterprise reasoning orchestration.",
    icon: Database,
    items: [
      { name: "AI Memory Runtime", route: "/ai/memory" },
      { name: "AI Agents", route: "/ai/agents" },
      { name: "Context Runtime", route: "/ai/context" },
      { name: "Knowledge Runtime", route: "/ai/knowledge" },
      { name: "Reasoning Engine", route: "/ai/reasoning" },
    ],
  },

  {
    title: "AI Governance & Monitoring",
    description:
      "AI governance, monitoring, security and enterprise observability.",
    icon: ShieldCheck,
    items: [
      { name: "AI Governance", route: "/ai/governance" },
      { name: "AI Monitoring", route: "/ai/monitoring" },
      { name: "AI Runtime Logs", route: "/ai/logs" },
      { name: "AI Compliance", route: "/ai/compliance" },
      { name: "AI Policies", route: "/ai/policies" },
    ],
  },

];

const STATUS = [

  {
    label: "AI Runtime",
    value: "ACTIVE",
  },

  {
    label: "Decision Engine",
    value: "ONLINE",
  },

  {
    label: "Cross-System AI",
    value: "RUNNING",
  },

  {
    label: "AI Agents",
    value: "ARMED",
  },

];

const QUICK_ACTIONS = [

  "Analyze operational runtime",
  "Forecast financial trends",
  "Review AI decisions",
  "Monitor AI agents",
  "Analyze customer behavior",
  "Review predictive models",

];

export default function AIPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-fuchsia-500/10">

            <Brain className="h-5 w-5 text-fuchsia-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-fuchsia-400">

            Churchill Platform

          </div>

        </div>

        <div className="flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              AI Runtime

            </h1>

            <p className="max-w-5xl text-lg leading-relaxed text-white/50">

              Enterprise AI runtime for autonomous execution, predictive reasoning,
              cross-system intelligence and operational orchestration.

            </p>

          </div>

          <Link
            href="/ai/live"
            className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 px-5 py-4 text-sm font-medium text-fuchsia-300 hover:bg-fuchsia-500/20"
          >

            Open AI Runtime

          </Link>

        </div>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-fuchsia-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="mb-10 rounded-[40px] border border-fuchsia-500/20 bg-fuchsia-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-fuchsia-500/10">

              <Sparkles className="h-8 w-8 text-fuchsia-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Enterprise AI Command

              </div>

              <div className="text-white/40">

                Execute cross-system intelligence, reasoning and autonomous enterprise operations.

              </div>

            </div>

          </div>

          <Link
            href="/ai/agents"
            className="rounded-2xl border border-fuchsia-500/20 bg-black/30 px-5 py-3 text-sm text-fuchsia-300"
          >

            Open AI Agents

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-fuchsia-400" />

          <input
            placeholder="Ask enterprise AI to reason, forecast, automate or orchestrate business operations..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-fuchsia-500 px-6 py-3 font-medium text-white">

            Execute

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {QUICK_ACTIONS.map((action) => (

            <button
              key={action}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 hover:border-fuchsia-500/30 hover:bg-fuchsia-500/10 hover:text-white"
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

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-fuchsia-500/10">

                    <Icon className="h-8 w-8 text-fuchsia-400" />

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
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-fuchsia-500/40 hover:bg-fuchsia-500/5"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-fuchsia-400" />

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
