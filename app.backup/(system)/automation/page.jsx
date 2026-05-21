"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  ArrowRight,
  BellRing,
  Bot,
  Brain,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Cpu,
  GitBranch,
  LayoutDashboard,
  Link2,
  MessageSquare,
  PlayCircle,
  Repeat,
  Rocket,
  Settings2,
  ShieldAlert,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Automation Overview",
    description:
      "Main automation command center, enterprise orchestration and workflow visibility.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/automation/overview" },
      { name: "Live Runtime", route: "/automation/live" },
      { name: "Automation Dashboard", route: "/automation/dashboard" },
      { name: "Workflow Health", route: "/automation/health" },
    ],
  },

  {
    title: "Workflow Runtime",
    description:
      "Enterprise workflows, execution pipelines and operational automation.",
    icon: Workflow,
    items: [
      { name: "Workflow Runtime", route: "/automation/workflows" },
      { name: "Workflow Builder", route: "/automation/builder" },
      { name: "Execution Pipelines", route: "/automation/pipelines" },
      { name: "Workflow Queue", route: "/automation/queue" },
      { name: "Workflow Templates", route: "/automation/templates" },
    ],
  },

  {
    title: "AI Automation",
    description:
      "AI-driven orchestration, intelligent automation and autonomous execution.",
    icon: Brain,
    items: [
      { name: "AI Automation", route: "/automation/ai" },
      { name: "AI Orchestration", route: "/automation/orchestration" },
      { name: "Decision Engine", route: "/automation/decisions" },
      { name: "AI Actions", route: "/automation/actions" },
      { name: "Automation Intelligence", route: "/automation/intelligence" },
    ],
  },

  {
    title: "Trigger & Event Engine",
    description:
      "Event-based automation, realtime triggers and workflow execution logic.",
    icon: Zap,
    items: [
      { name: "Trigger Engine", route: "/automation/triggers" },
      { name: "Event Runtime", route: "/automation/events" },
      { name: "Realtime Actions", route: "/automation/realtime" },
      { name: "Condition Logic", route: "/automation/conditions" },
      { name: "Execution Rules", route: "/automation/rules" },
    ],
  },

  {
    title: "Scheduling Runtime",
    description:
      "Scheduled jobs, timed execution and recurring automation operations.",
    icon: CalendarClock,
    items: [
      { name: "Scheduled Jobs", route: "/automation/scheduled" },
      { name: "Recurring Tasks", route: "/automation/recurring" },
      { name: "Execution Scheduler", route: "/automation/scheduler" },
      { name: "Cron Runtime", route: "/automation/cron" },
      { name: "Task Calendar", route: "/automation/calendar" },
    ],
  },

  {
    title: "Approval Automation",
    description:
      "Approval routing, escalation flows and automated governance workflows.",
    icon: CheckCircle2,
    items: [
      { name: "Approval Runtime", route: "/automation/approvals" },
      { name: "Escalation Runtime", route: "/automation/escalations" },
      { name: "Decision Routing", route: "/automation/routing" },
      { name: "Approval Policies", route: "/automation/policies" },
      { name: "Governance Workflows", route: "/automation/governance" },
    ],
  },

  {
    title: "Notifications & Alerts",
    description:
      "Enterprise notifications, alerting systems and communication automation.",
    icon: BellRing,
    items: [
      { name: "Notification Runtime", route: "/automation/notifications" },
      { name: "Alert Automation", route: "/automation/alerts" },
      { name: "Messaging Runtime", route: "/automation/messages" },
      { name: "Communication Flows", route: "/automation/communications" },
      { name: "Critical Alerts", route: "/automation/critical" },
    ],
  },

  {
    title: "Integration Automation",
    description:
      "Cross-platform integrations, API orchestration and external workflow connectivity.",
    icon: Link2,
    items: [
      { name: "Integrations", route: "/automation/integrations" },
      { name: "API Runtime", route: "/automation/api" },
      { name: "Webhook Runtime", route: "/automation/webhooks" },
      { name: "External Systems", route: "/automation/external" },
      { name: "Connection Health", route: "/automation/connections" },
    ],
  },

  {
    title: "Department Automation",
    description:
      "Automation systems connected to enterprise operational departments.",
    icon: Repeat,
    items: [
      { name: "Marketing Automation", route: "/automation/marketing" },
      { name: "Inventory Automation", route: "/automation/inventory" },
      { name: "Procurement Automation", route: "/automation/procurement" },
      { name: "Accounting Automation", route: "/automation/accounting" },
      { name: "Staff Automation", route: "/automation/staff" },
    ],
  },

  {
    title: "Monitoring & Logs",
    description:
      "Automation monitoring, execution tracking and runtime observability.",
    icon: Cpu,
    items: [
      { name: "Automation Logs", route: "/automation/logs" },
      { name: "Execution Monitoring", route: "/automation/monitoring" },
      { name: "Runtime Status", route: "/automation/status" },
      { name: "Failure Tracking", route: "/automation/failures" },
      { name: "Audit Runtime", route: "/automation/audit" },
    ],
  },

];

const STATUS = [

  {
    label: "Automation Runtime",
    value: "ACTIVE",
  },

  {
    label: "Workflow Engine",
    value: "ONLINE",
  },

  {
    label: "AI Orchestration",
    value: "RUNNING",
  },

  {
    label: "Realtime Triggers",
    value: "ARMED",
  },

];

const QUICK_ACTIONS = [

  "Review automation failures",
  "Analyze workflow queue",
  "Check escalation flows",
  "Review scheduled jobs",
  "Monitor integrations",
  "Analyze AI orchestration",

];

export default function AutomationPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/10">

            <Workflow className="h-5 w-5 text-sky-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-sky-400">

            Churchill Platform

          </div>

        </div>

        <div className="flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Automation

            </h1>

            <p className="max-w-5xl text-lg leading-relaxed text-white/50">

              Enterprise automation runtime for workflows, AI orchestration,
              triggers, scheduling, integrations and operational execution.

            </p>

          </div>

          <Link
            href="/automation/live"
            className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-5 py-4 text-sm font-medium text-sky-300 hover:bg-sky-500/20"
          >

            Open Automation Runtime

          </Link>

        </div>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-sky-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="mb-10 rounded-[40px] border border-sky-500/20 bg-sky-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-500/10">

              <Sparkles className="h-8 w-8 text-sky-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Automation AI Command

              </div>

              <div className="text-white/40">

                Orchestrate workflows, triggers, scheduling and enterprise execution.

              </div>

            </div>

          </div>

          <Link
            href="/automation/ai"
            className="rounded-2xl border border-sky-500/20 bg-black/30 px-5 py-3 text-sm text-sky-300"
          >

            Open Automation Intelligence

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-sky-400" />

          <input
            placeholder="Ask automation AI to orchestrate workflows, monitor triggers or optimize execution..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-sky-500 px-6 py-3 font-medium text-white">

            Run

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {QUICK_ACTIONS.map((action) => (

            <button
              key={action}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 hover:border-sky-500/30 hover:bg-sky-500/10 hover:text-white"
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

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-500/10">

                    <Icon className="h-8 w-8 text-sky-400" />

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
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-sky-500/40 hover:bg-sky-500/5"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-sky-400" />

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
