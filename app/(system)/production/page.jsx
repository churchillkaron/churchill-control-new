"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  ChefHat,
  ClipboardList,
  Clock3,
  DollarSign,
  Factory,
  FileBarChart,
  Flame,
  LayoutDashboard,
  Package,
  PackageCheck,
  Scale,
  Sparkles,
  TimerReset,
  TrendingUp,
  UtensilsCrossed,
  Warehouse,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Production Overview",
    description:
      "Main production command center, kitchen visibility and operational control.",
    icon: LayoutDashboard,
    items: [
    ],
  },

  {
    title: "Recipe Runtime",
    description:
      "Recipe management, recipe structures and production preparation systems.",
    icon: ChefHat,
    items: [
    ],
  },

  {
    title: "Batch Production",
    description:
      "Batch preparation, prep operations and kitchen production runtime.",
    icon: Factory,
    items: [
    ],
  },

  {
    title: "Ingredient Usage",
    description:
      "Ingredient consumption, production usage and stock coordination.",
    icon: Package,
    items: [
    ],
  },

  {
    title: "Costing & Yield",
    description:
      "Recipe costing, production costs and yield management operations.",
    icon: DollarSign,
    items: [
    ],
  },

  {
    title: "Kitchen & Stations",
    description:
      "Kitchen stations, preparation flow and realtime production operations.",
    icon: UtensilsCrossed,
    items: [
    ],
  },

  {
    title: "Waste & Variance",
    description:
      "Production waste tracking, spoilage monitoring and variance analysis.",
    icon: Flame,
    items: [
    ],
  },

  {
    title: "Production Analytics",
    description:
      "Production performance, forecasting and operational intelligence.",
    icon: BarChart3,
    items: [
    ],
  },

  {
    title: "Menu Engineering",
    description:
      "Menu profitability, production optimization and item performance analysis.",
    icon: Scale,
    items: [
    ],
  },

  {
    title: "AI Production Intelligence",
    description:
      "AI production forecasting, kitchen intelligence and prep optimization.",
    icon: Brain,
    items: [
    ],
  },

];

const STATUS = [

  {
    label: "Production Runtime",
    value: "ACTIVE",
  },

  {
    label: "Batch Production",
    value: "ONLINE",
  },

  {
    label: "Recipe Engine",
    value: "RUNNING",
  },

  {
    label: "Production AI",
    value: "ARMED",
  },

];

const QUICK_ACTIONS = [

  "Review recipe costing",
  "Analyze food cost",
  "Check prep schedule",
  "Review production waste",
  "Forecast prep demand",
  "Analyze menu profitability",

];

export default function ProductionPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500/10">

            <Factory className="h-5 w-5 text-orange-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-orange-400">

            Churchill Platform

          </div>

        </div>

        <div className="flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Production

            </h1>

            <p className="max-w-5xl text-lg leading-relaxed text-white/50">

              Enterprise production runtime for recipes, prep operations,
              food costing, kitchen production and manufacturing intelligence.

            </p>

          </div>

          <Link
            href="/production/live"
            className="rounded-2xl border border-orange-500/20 bg-orange-500/10 px-5 py-4 text-sm font-medium text-orange-300 hover:bg-orange-500/20"
          >

            Open Production Runtime

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

                Production AI Command

              </div>

              <div className="text-white/40">

                Analyze recipe costs, production output and kitchen operations.

              </div>

            </div>

          </div>

          <Link
            href="/production/ai"
            className="rounded-2xl border border-orange-500/20 bg-black/30 px-5 py-3 text-sm text-orange-300"
          >

            Open Production Intelligence

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-orange-400" />

          <input
            placeholder="Ask production AI to analyze food cost, prep forecasting or kitchen performance..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-orange-500 px-6 py-3 font-medium text-white">

            Run

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
