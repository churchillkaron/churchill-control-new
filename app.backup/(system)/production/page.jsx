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
      { name: "Overview", route: "/production/overview" },
      { name: "Live Runtime", route: "/production/live" },
      { name: "Production Dashboard", route: "/production/dashboard" },
      { name: "Production Health", route: "/production/health" },
    ],
  },

  {
    title: "Recipe Runtime",
    description:
      "Recipe management, recipe structures and production preparation systems.",
    icon: ChefHat,
    items: [
      { name: "Recipes", route: "/production/recipes" },
      { name: "Recipe Builder", route: "/production/recipe-builder" },
      { name: "Ingredient Mapping", route: "/production/ingredients" },
      { name: "Recipe Versions", route: "/production/versions" },
      { name: "Recipe Categories", route: "/production/categories" },
    ],
  },

  {
    title: "Batch Production",
    description:
      "Batch preparation, prep operations and kitchen production runtime.",
    icon: Factory,
    items: [
      { name: "Batch Production", route: "/production/batches" },
      { name: "Prep Runtime", route: "/production/prep" },
      { name: "Prep Scheduling", route: "/production/scheduling" },
      { name: "Production Queue", route: "/production/queue" },
      { name: "Kitchen Production", route: "/production/kitchen" },
    ],
  },

  {
    title: "Ingredient Usage",
    description:
      "Ingredient consumption, production usage and stock coordination.",
    icon: Package,
    items: [
      { name: "Ingredient Usage", route: "/production/usage" },
      { name: "Consumption Logs", route: "/production/consumption" },
      { name: "Prep Inventory", route: "/production/prep-inventory" },
      { name: "Inventory Coordination", route: "/production/inventory" },
      { name: "Stock Deduction", route: "/production/deductions" },
    ],
  },

  {
    title: "Costing & Yield",
    description:
      "Recipe costing, production costs and yield management operations.",
    icon: DollarSign,
    items: [
      { name: "Recipe Costing", route: "/production/costing" },
      { name: "Food Cost Runtime", route: "/production/food-cost" },
      { name: "Yield Tracking", route: "/production/yield" },
      { name: "Production Costs", route: "/production/costs" },
      { name: "Cost Variance", route: "/production/variance" },
    ],
  },

  {
    title: "Kitchen & Stations",
    description:
      "Kitchen stations, preparation flow and realtime production operations.",
    icon: UtensilsCrossed,
    items: [
      { name: "Kitchen Runtime", route: "/kitchen" },
      { name: "Station Production", route: "/production/stations" },
      { name: "Kitchen Queue", route: "/production/kitchen-queue" },
      { name: "Prep Stations", route: "/production/prep-stations" },
      { name: "Expo Runtime", route: "/production/expo" },
    ],
  },

  {
    title: "Waste & Variance",
    description:
      "Production waste tracking, spoilage monitoring and variance analysis.",
    icon: Flame,
    items: [
      { name: "Waste Runtime", route: "/production/waste" },
      { name: "Spoilage Tracking", route: "/production/spoilage" },
      { name: "Production Variance", route: "/production/variances" },
      { name: "Loss Analysis", route: "/production/losses" },
      { name: "Waste Reports", route: "/production/waste-reports" },
    ],
  },

  {
    title: "Production Analytics",
    description:
      "Production performance, forecasting and operational intelligence.",
    icon: BarChart3,
    items: [
      { name: "Production Analytics", route: "/production/analytics" },
      { name: "Performance Metrics", route: "/production/performance" },
      { name: "Production Forecasting", route: "/production/forecasting" },
      { name: "Output Trends", route: "/production/trends" },
      { name: "Production Reports", route: "/production/reports" },
    ],
  },

  {
    title: "Menu Engineering",
    description:
      "Menu profitability, production optimization and item performance analysis.",
    icon: Scale,
    items: [
      { name: "Menu Engineering", route: "/production/menu-engineering" },
      { name: "Menu Profitability", route: "/production/profitability" },
      { name: "Dish Performance", route: "/production/dishes" },
      { name: "Item Cost Analysis", route: "/production/item-costs" },
      { name: "Menu Optimization", route: "/production/optimization" },
    ],
  },

  {
    title: "AI Production Intelligence",
    description:
      "AI production forecasting, kitchen intelligence and prep optimization.",
    icon: Brain,
    items: [
      { name: "Production AI", route: "/production/ai" },
      { name: "AI Recommendations", route: "/production/recommendations" },
      { name: "Prep Forecasting", route: "/production/predictions" },
      { name: "Automation Runtime", route: "/production/automation" },
      { name: "Optimization Engine", route: "/production/ai-optimization" },
    ],
  },

];

const STATUS = [

  {
    label: "Production Runtime",
    value: "ACTIVE",
  },

  {
    label: "Kitchen Production",
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
