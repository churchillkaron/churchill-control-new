"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Brain,
  LineChart,
  PieChart,
  Sparkles,
  TrendingUp,
} from "lucide-react";

const INSIGHT_SYSTEMS = [

  {
    title: "Analytics",
    route: "/analytics",
    icon: BarChart3,
    description:
      "Operational analytics and business intelligence reporting.",
  },

  {
    title: "Forecasting",
    route: "/intelligence/forecasting",
    icon: TrendingUp,
    description:
      "Predictive forecasting and AI business projections.",
  },

  {
    title: "Reports",
    route: "/reports",
    icon: PieChart,
    description:
      "Financial, operational and enterprise reporting.",
  },

  {
    title: "Recommendations",
    route: "/intelligence/recommendations",
    icon: Brain,
    description:
      "AI recommendations and optimization insights.",
  },

  {
    title: "Anomaly Detection",
    route: "/intelligence/anomaly",
    icon: AlertTriangle,
    description:
      "Realtime anomaly detection and operational alerts.",
  },

  {
    title: "Revenue Intelligence",
    route: "/intelligence/revenue",
    icon: LineChart,
    description:
      "Revenue analysis and performance intelligence.",
  },

];

export default function InsightsPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      {/* HERO */}

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/10">

            <BarChart3 className="h-5 w-5 text-violet-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-violet-400">

            Churchill Intelligence Insights

          </div>

        </div>

        <h1 className="mb-4 text-7xl font-light">

          Insights

        </h1>

        <p className="max-w-4xl text-lg leading-relaxed text-white/50">

          Analytics, forecasting, recommendations and enterprise
          intelligence reporting systems.

        </p>

      </div>

      {/* GRID */}

      <div className="grid grid-cols-3 gap-6">

        {INSIGHT_SYSTEMS.map(
          system => {

            const Icon =
              system.icon;

            return (

              <Link
                key={system.route}
                href={system.route}
                className="group relative overflow-hidden rounded-[36px] border border-white/10 bg-white/[0.03] p-8 transition-all hover:border-violet-500/40 hover:bg-violet-500/5"
              >

                <div className="relative z-10 mb-10 flex items-center justify-between">

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-500/10">

                    <Icon className="h-8 w-8 text-violet-400" />

                  </div>

                  <ArrowRight className="h-5 w-5 text-white/20 transition-all group-hover:translate-x-1 group-hover:text-violet-400" />

                </div>

                <div className="relative z-10">

                  <div className="mb-4 text-4xl font-light">

                    {system.title}

                  </div>

                  <div className="leading-relaxed text-white/40">

                    {system.description}

                  </div>

                </div>

              </Link>

            );

          }
        )}

      </div>

      {/* STATUS */}

      <div className="mt-10 rounded-[36px] border border-violet-500/20 bg-violet-500/5 p-8">

        <div className="mb-6 flex items-center gap-3">

          <Sparkles className="h-6 w-6 text-violet-400" />

          <div className="text-2xl font-light text-violet-400">

            Intelligence Status

          </div>

        </div>

        <div className="grid grid-cols-4 gap-6">

          <div>

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              Analytics

            </div>

            <div className="text-2xl font-light text-violet-400">

              ACTIVE

            </div>

          </div>

          <div>

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              Forecasting

            </div>

            <div className="text-2xl font-light">

              ONLINE

            </div>

          </div>

          <div>

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              AI Insights

            </div>

            <div className="text-2xl font-light">

              READY

            </div>

          </div>

          <div>

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              Reporting

            </div>

            <div className="text-2xl font-light">

              STABLE

            </div>

          </div>

        </div>

      </div>

    </main>

  );

}
