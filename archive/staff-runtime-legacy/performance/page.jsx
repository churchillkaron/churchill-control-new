"use client";

import {
  Trophy,
  Flame,
  Brain,
  Languages,
  Crown,
} from "lucide-react";

export default function StaffPerformancePage() {

  const stats = [

    {
      title: "Guest Recovery",
      value: "92%",
      icon: Crown,
      color: "text-amber-300",
    },

    {
      title: "Upsell Skill",
      value: "88%",
      icon: Flame,
      color: "text-fuchsia-300",
    },

    {
      title: "Translation",
      value: "95%",
      icon: Languages,
      color: "text-cyan-300",
    },

    {
      title: "AI Instinct",
      value: "91%",
      icon: Brain,
      color: "text-violet-300",
    },

  ];

  return (

    <div className="min-h-screen bg-black px-5 py-10 text-white">

      <div className="mx-auto max-w-5xl">

        <div className="mb-10">

          <div className="text-[11px] uppercase tracking-[0.35em] text-amber-300">
            Churchill Staff
          </div>

          <div className="mt-3 flex items-center gap-3 text-5xl font-black">

            <Trophy className="h-10 w-10 text-amber-300" />

            Performance Runtime

          </div>

          <div className="mt-3 text-white/40">
            AI coaching, rankings, instinct score and operational growth.
          </div>

        </div>

        <div className="grid gap-4 md:grid-cols-2">

          {stats.map(
            (
              stat,
              index
            ) => {

              const Icon =
                stat.icon;

              return (

                <div
                  key={index}
                  className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6"
                >

                  <div className="flex items-center justify-between">

                    <div>

                      <div className="text-sm uppercase tracking-[0.25em] text-white/40">
                        {stat.title}
                      </div>

                      <div className={`mt-3 text-5xl font-black ${stat.color}`}>
                        {stat.value}
                      </div>

                    </div>

                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-black/40">

                      <Icon className={`h-8 w-8 ${stat.color}`} />

                    </div>

                  </div>

                </div>

              );

            }
          )}

        </div>

      </div>

    </div>

  );

}
