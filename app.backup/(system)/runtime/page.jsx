"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  Activity,
  ArrowRight,
  Brain,
  Command,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const RUNTIME_PILLARS = [

  {
    title: "Dashboard",
    route: "/dashboard",
    description:
      "Executive overview, KPIs, alerts and platform health.",
    icon: LayoutDashboard,
    color:
      "violet",
  },

  {
    title: "Control",
    route: "/control",
    description:
      "Realtime operational runtime and execution layer.",
    icon: Activity,
    color:
      "emerald",
  },

  {
    title: "Intelligence",
    route: "/intelligence",
    description:
      "AI orchestration, agents and enterprise intelligence.",
    icon: Brain,
    color:
      "cyan",
  },

  {
    title: "Management",
    route: "/management",
    description:
      "Governance, approvals and administration systems.",
    icon: ShieldCheck,
    color:
      "amber",
  },

  {
    title: "Command",
    route: "/command",
    description:
      "AI interaction layer and runtime command execution.",
    icon: Command,
    color:
      "pink",
  },

];

export default function RuntimePage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      {/* HERO */}

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/10">

            <Sparkles className="h-5 w-5 text-violet-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-violet-400">

            Churchill Runtime Architecture

          </div>

        </div>

        <h1 className="mb-4 text-7xl font-light">

          Runtime Core

        </h1>

        <p className="max-w-4xl text-lg leading-relaxed text-white/50">

          Unified enterprise runtime architecture for operations,
          intelligence, governance and realtime execution.

        </p>

      </div>

      {/* GRID */}

      <div className="grid grid-cols-3 gap-6">

        {RUNTIME_PILLARS.map(
          pillar => {

            const Icon =
              pillar.icon;

            return (

              <Link
                key={pillar.route}
                href={pillar.route}
                className="group relative overflow-hidden rounded-[36px] border border-white/10 bg-white/[0.03] p-8 transition-all hover:border-violet-500/40 hover:bg-violet-500/5"
              >

                {/* GLOW */}

                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/0 via-violet-500/0 to-violet-500/0 opacity-0 transition-all duration-500 group-hover:opacity-100" />

                {/* TOP */}

                <div className="relative z-10 mb-10 flex items-center justify-between">

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-500/10">

                    <Icon className="h-8 w-8 text-violet-400" />

                  </div>

                  <ArrowRight className="h-5 w-5 text-white/20 transition-all group-hover:translate-x-1 group-hover:text-violet-400" />

                </div>

                {/* CONTENT */}

                <div className="relative z-10">

                  <div className="mb-4 text-4xl font-light">

                    {pillar.title}

                  </div>

                  <div className="leading-relaxed text-white/40">

                    {pillar.description}

                  </div>

                </div>

              </Link>

            );

          }
        )}

      </div>

    </main>

  );

}
