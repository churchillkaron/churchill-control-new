"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  ArrowRight,
  Bot,
  Brain,
  Cpu,
  Database,
  GitMerge,
  LayoutDashboard,
  Network,
  Orbit,
  Radar,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Singularity Overview",
    description:
      "Master enterprise AI consciousness runtime and unified orchestration layer.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/singularity/overview" },
      { name: "Live Runtime", route: "/singularity/live" },
      { name: "AI Command Center", route: "/singularity/command" },
      { name: "System Awareness", route: "/singularity/awareness" },
    ],
  },

  {
    title: "Unified AI Runtime",
    description:
      "Unified enterprise AI runtime and cross-system intelligence execution.",
    icon: Brain,
    items: [
      { name: "Unified AI Runtime", route: "/singularity/runtime" },
      { name: "Cross-System Cognition", route: "/singularity/cognition" },
      { name: "Executive AI", route: "/singularity/executive" },
      { name: "Strategic Intelligence", route: "/singularity/strategy" },
      { name: "AI Signal Fusion", route: "/singularity/signals" },
    ],
  },

  {
    title: "Enterprise Memory",
    description:
      "Enterprise-wide AI memory, context orchestration and knowledge runtime.",
    icon: Database,
    items: [
      { name: "Enterprise Memory", route: "/singularity/memory" },
      { name: "Knowledge Runtime", route: "/singularity/knowledge" },
      { name: "Context Engine", route: "/singularity/context" },
      { name: "Memory Correlation", route: "/singularity/correlation" },
      { name: "Historical Intelligence", route: "/singularity/history" },
    ],
  },

  {
    title: "Autonomous Intelligence",
    description:
      "Autonomous reasoning, optimization and enterprise decision execution.",
    icon: Zap,
    items: [
      { name: "Decision Engine", route: "/singularity/decisions" },
      { name: "Autonomous Optimization", route: "/singularity/optimization" },
      { name: "Predictive Consciousness", route: "/singularity/predictive" },
      { name: "AI Evolution Runtime", route: "/singularity/evolution" },
      { name: "Autonomous Actions", route: "/singularity/actions" },
    ],
  },

  {
    title: "Multi-Agent Orchestration",
    description:
      "AI agents, orchestration runtime and enterprise coordination systems.",
    icon: Workflow,
    items: [
      { name: "Multi-Agent Runtime", route: "/singularity/agents" },
      { name: "AI Orchestration Core", route: "/singularity/orchestration" },
      { name: "Agent Coordination", route: "/singularity/coordination" },
      { name: "Enterprise Synchronization", route: "/singularity/sync" },
      { name: "Global Intelligence Streams", route: "/singularity/streams" },
    ],
  },

];

const STATUS = [

  {
    label: "Unified AI",
    value: "ACTIVE",
  },

  {
    label: "Enterprise Cognition",
    value: "ONLINE",
  },

  {
    label: "AI Orchestration",
    value: "RUNNING",
  },

  {
    label: "Autonomous Runtime",
    value: "ARMED",
  },

];

export default function SingularityPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-500/10">

            <Orbit className="h-5 w-5 text-pink-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-pink-400">

            Churchill Platform

          </div>

        </div>

        <h1 className="mb-4 text-7xl font-light">

          Singularity

        </h1>

        <p className="max-w-5xl text-lg leading-relaxed text-white/50">

          Master enterprise AI consciousness runtime for unified reasoning,
          autonomous orchestration and cross-system intelligence coordination.

        </p>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-pink-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="mb-10 rounded-[40px] border border-pink-500/20 bg-pink-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-pink-500/10">

              <Sparkles className="h-8 w-8 text-pink-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Singularity AI Core

              </div>

              <div className="text-white/40">

                Unified enterprise reasoning, orchestration and autonomous cognition.

              </div>

            </div>

          </div>

          <Link
            href="/singularity/runtime"
            className="rounded-2xl border border-pink-500/20 bg-black/30 px-5 py-3 text-sm text-pink-300"
          >

            Open AI Consciousness

          </Link>

        </div>

        <div className="flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-pink-400" />

          <input
            placeholder="Ask Singularity to orchestrate enterprise intelligence and autonomous operations..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-pink-500 px-6 py-3 font-medium text-white">

            Execute

          </button>

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

              <div className="mb-8 flex gap-5">

                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-pink-500/10">

                  <Icon className="h-8 w-8 text-pink-400" />

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
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-pink-500/40 hover:bg-pink-500/5"
                  >

                    <div className="flex items-center justify-between">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-pink-400" />

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
