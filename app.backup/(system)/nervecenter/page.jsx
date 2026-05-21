"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  Activity,
  ArrowRight,
  BellRing,
  Bot,
  Brain,
  Cpu,
  GitBranch,
  LayoutDashboard,
  Network,
  Radio,
  Radar,
  Sparkles,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Nervecenter Overview",
    description:
      "Enterprise event-routing runtime and orchestration nervous system.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/nervecenter/overview" },
      { name: "Live Runtime", route: "/nervecenter/live" },
      { name: "Signal Dashboard", route: "/nervecenter/dashboard" },
      { name: "System Health", route: "/nervecenter/health" },
    ],
  },

  {
    title: "Event Runtime",
    description:
      "Realtime enterprise events, orchestration signals and runtime streams.",
    icon: Activity,
    items: [
      { name: "Event Runtime", route: "/nervecenter/events" },
      { name: "Realtime Streams", route: "/nervecenter/streams" },
      { name: "Operational Signals", route: "/nervecenter/operations" },
      { name: "Financial Signals", route: "/nervecenter/finance" },
      { name: "Security Signals", route: "/nervecenter/security" },
    ],
  },

  {
    title: "Signal Routing",
    description:
      "Signal routing, orchestration runtime and enterprise event synchronization.",
    icon: Radio,
    items: [
      { name: "Signal Routing", route: "/nervecenter/routing" },
      { name: "Trigger Engine", route: "/nervecenter/triggers" },
      { name: "Workflow Bus", route: "/nervecenter/workflows" },
      { name: "AI Routing", route: "/nervecenter/ai-routing" },
      { name: "Communication Bus", route: "/nervecenter/communications" },
    ],
  },

  {
    title: "Realtime Intelligence",
    description:
      "Cross-system intelligence streams and enterprise realtime orchestration.",
    icon: Brain,
    items: [
      { name: "Realtime Intelligence", route: "/nervecenter/intelligence" },
      { name: "AI Signals", route: "/nervecenter/ai-signals" },
      { name: "Decision Runtime", route: "/nervecenter/decisions" },
      { name: "Runtime Correlation", route: "/nervecenter/correlation" },
      { name: "Enterprise Awareness", route: "/nervecenter/awareness" },
    ],
  },

  {
    title: "Cross-System Runtime",
    description:
      "Cross-platform synchronization, orchestration and enterprise signal infrastructure.",
    icon: Network,
    items: [
      { name: "Cross-System Events", route: "/nervecenter/cross-system" },
      { name: "Runtime Orchestration", route: "/nervecenter/orchestration" },
      { name: "System Synchronization", route: "/nervecenter/sync" },
      { name: "Realtime Runtime", route: "/nervecenter/runtime" },
      { name: "Event Memory", route: "/nervecenter/memory" },
    ],
  },

];

const STATUS = [

  {
    label: "Signal Runtime",
    value: "ACTIVE",
  },

  {
    label: "Realtime Streams",
    value: "ONLINE",
  },

  {
    label: "Cross-System Events",
    value: "RUNNING",
  },

  {
    label: "AI Routing",
    value: "ARMED",
  },

];

export default function NervecenterPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10">

            <Radar className="h-5 w-5 text-cyan-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400">

            Churchill Platform

          </div>

        </div>

        <h1 className="mb-4 text-7xl font-light">

          Nervecenter

        </h1>

        <p className="max-w-5xl text-lg leading-relaxed text-white/50">

          Enterprise nervous system for realtime orchestration,
          event routing, AI synchronization and cross-system runtime coordination.

        </p>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-cyan-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="grid grid-cols-2 gap-6">

        {SECTIONS.map((section) => {

          const Icon = section.icon;

          return (

            <div
              key={section.title}
              className="rounded-[36px] border border-white/10 bg-white/[0.03] p-8"
            >

              <div className="mb-8 flex gap-5">

                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-500/10">

                  <Icon className="h-8 w-8 text-cyan-400" />

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

              <div className="grid grid-cols-2 gap-3">

                {section.items.map((item) => (

                  <Link
                    key={item.route}
                    href={item.route}
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-cyan-500/40 hover:bg-cyan-500/5"
                  >

                    <div className="flex items-center justify-between">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-cyan-400" />

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
