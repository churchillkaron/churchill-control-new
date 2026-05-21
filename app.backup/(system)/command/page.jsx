"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Bot,
  Brain,
  Building2,
  ChefHat,
  Cpu,
  DollarSign,
  Flame,
  LayoutDashboard,
  Monitor,
  Network,
  Radar,
  ShieldAlert,
  Sparkles,
  Users,
  Workflow,
 Zap,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Command Overview",
    description:
      "Main enterprise mission control and realtime operational command runtime.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/command/overview" },
      { name: "Live Runtime", route: "/command/live" },
      { name: "Mission Control", route: "/command/mission-control" },
      { name: "Enterprise Health", route: "/command/health" },
    ],
  },

  {
    title: "Live Operations",
    description:
      "Realtime operational visibility and live enterprise execution monitoring.",
    icon: Monitor,
    items: [
      { name: "Operations Runtime", route: "/command/operations" },
      { name: "Realtime Orders", route: "/command/orders" },
      { name: "Floor Runtime", route: "/command/floor" },
      { name: "Service Runtime", route: "/command/service" },
      { name: "Live Metrics", route: "/command/metrics" },
    ],
  },

  {
    title: "Alerts & Incidents",
    description:
      "Enterprise alerting, incident response and operational escalation runtime.",
    icon: BellRing,
    items: [
      { name: "Realtime Alerts", route: "/command/alerts" },
      { name: "Incident Command", route: "/command/incidents" },
      { name: "Escalation Runtime", route: "/command/escalations" },
      { name: "Critical Events", route: "/command/critical" },
      { name: "Risk Monitoring", route: "/command/risk" },
    ],
  },

  {
    title: "Workflow Execution",
    description:
      "Operational workflows, automation runtime and enterprise execution pipelines.",
    icon: Workflow,
    items: [
      { name: "Workflow Runtime", route: "/command/workflows" },
      { name: "Execution Runtime", route: "/command/execution" },
      { name: "Automation Runtime", route: "/command/automation" },
      { name: "Trigger Engine", route: "/command/triggers" },
      { name: "Operational Actions", route: "/command/actions" },
    ],
  },

  {
    title: "AI Runtime",
    description:
      "Realtime AI orchestration, enterprise intelligence and autonomous execution.",
    icon: Brain,
    items: [
      { name: "AI Runtime", route: "/command/ai" },
      { name: "AI Decisions", route: "/command/decisions" },
      { name: "AI Monitoring", route: "/command/ai-monitoring" },
      { name: "AI Execution", route: "/command/ai-execution" },
      { name: "AI Recommendations", route: "/command/recommendations" },
    ],
  },

  {
    title: "Kitchen & Production",
    description:
      "Kitchen runtime, production monitoring and food operation control.",
    icon: ChefHat,
    items: [
      { name: "Kitchen Runtime", route: "/command/kitchen" },
      { name: "Expo Runtime", route: "/command/expo" },
      { name: "Production Runtime", route: "/command/production" },
      { name: "Food Cost Runtime", route: "/command/food-cost" },
      { name: "Kitchen Alerts", route: "/command/kitchen-alerts" },
    ],
  },

  {
    title: "Financial Runtime",
    description:
      "Realtime financial monitoring, approvals and operational finance visibility.",
    icon: DollarSign,
    items: [
      { name: "Financial Runtime", route: "/command/finance" },
      { name: "Realtime Revenue", route: "/command/revenue" },
      { name: "Cashflow Runtime", route: "/command/cashflow" },
      { name: "Approval Command", route: "/command/approvals" },
      { name: "Financial Alerts", route: "/command/financial-alerts" },
    ],
  },

  {
    title: "Staff & Communications",
    description:
      "Staff runtime, operational communications and workforce visibility.",
    icon: Users,
    items: [
      { name: "Staff Runtime", route: "/command/staff" },
      { name: "Realtime Communications", route: "/command/communications" },
      { name: "Shift Runtime", route: "/command/shifts" },
      { name: "Performance Runtime", route: "/command/performance" },
      { name: "Department Runtime", route: "/command/departments" },
    ],
  },

  {
    title: "Crisis & Emergency",
    description:
      "Emergency operations, crisis coordination and enterprise incident management.",
    icon: ShieldAlert,
    items: [
      { name: "Crisis Runtime", route: "/command/crisis" },
      { name: "Emergency Runtime", route: "/command/emergency" },
      { name: "Recovery Operations", route: "/command/recovery" },
      { name: "System Failures", route: "/command/failures" },
      { name: "Disaster Runtime", route: "/command/disaster" },
    ],
  },

  {
    title: "Cross-System Monitoring",
    description:
      "Cross-platform monitoring, orchestration and realtime enterprise visibility.",
    icon: Network,
    items: [
      { name: "Cross-System Runtime", route: "/command/cross-system" },
      { name: "Realtime Monitoring", route: "/command/monitoring" },
      { name: "Enterprise Signals", route: "/command/signals" },
      { name: "Runtime Analytics", route: "/command/analytics" },
      { name: "System Orchestration", route: "/command/orchestration" },
    ],
  },

];

const STATUS = [

  {
    label: "Mission Control",
    value: "ACTIVE",
  },

  {
    label: "Operational Runtime",
    value: "ONLINE",
  },

  {
    label: "AI Execution",
    value: "RUNNING",
  },

  {
    label: "Realtime Alerts",
    value: "ARMED",
  },

];

const QUICK_ACTIONS = [

  "Review operational alerts",
  "Analyze workflow execution",
  "Monitor AI runtime",
  "Check kitchen operations",
  "Review financial runtime",
  "Analyze realtime incidents",

];

export default function CommandPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500/10">

            <Radar className="h-5 w-5 text-orange-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-orange-400">

            Churchill Platform

          </div>

        </div>

        <div className="flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Command

            </h1>

            <p className="max-w-5xl text-lg leading-relaxed text-white/50">

              Enterprise mission control runtime for realtime operations,
              orchestration, incident response and operational execution.

            </p>

          </div>

          <Link
            href="/command/live"
            className="rounded-2xl border border-orange-500/20 bg-orange-500/10 px-5 py-4 text-sm font-medium text-orange-300 hover:bg-orange-500/20"
          >

            Open Mission Control

          </Link>

        </div>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-orange-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="mb-10 rounded-[40px] border border-orange-500/20 bg-orange-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-500/10">

              <Sparkles className="h-8 w-8 text-orange-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Mission AI Command

              </div>

              <div className="text-white/40">

                Coordinate operations, incidents, workflows and enterprise execution.

              </div>

            </div>

          </div>

          <Link
            href="/command/ai"
            className="rounded-2xl border border-orange-500/20 bg-black/30 px-5 py-3 text-sm text-orange-300"
          >

            Open AI Runtime

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-orange-400" />

          <input
            placeholder="Ask mission AI to coordinate operations, incidents or enterprise execution..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-orange-500 px-6 py-3 font-medium text-white">

            Execute

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {QUICK_ACTIONS.map((action) => (

            <button
              key={action}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 hover:border-orange-500/30 hover:bg-orange-500/10 hover:text-white"
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

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-500/10">

                    <Icon className="h-8 w-8 text-orange-400" />

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
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-orange-500/40 hover:bg-orange-500/5"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-orange-400" />

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
