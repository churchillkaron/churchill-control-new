"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Target,
  Trophy,
  Flame,
  Crown,
  Brain,
} from "lucide-react";

export default function StaffGoalsPage() {

  const [runtime, setRuntime] =
    useState(null);

  const [goals, setGoals] =
    useState([]);

  useEffect(() => {

    loadGoals();

  }, []);

  async function loadGoals() {

    try {

      const res =
        await fetch(
          "/api/staff/ai-runtime",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              role: "STAFF",
              question:
                "Generate realtime staff goals and progression analysis.",
            }),
          }
        );

      const data =
        await res.json();

      setRuntime(
        data
      );

      const generated = [

        {
          title:
            "Reach Elite Runtime",
          progress:
            data.runtimeLevel ===
            "ELITE"
              ? 100
              : 82,
          reward:
            "Executive Hospitality Rank",
          icon:
            Crown,
          color:
            "text-amber-300",
        },

        {
          title:
            "Increase Revenue Aura",
          progress:
            data.pressureLevel ===
            "Elevated"
              ? 91
              : 73,
          reward:
            "Luxury Upsell Recognition",
          icon:
            Flame,
          color:
            "text-fuchsia-300",
        },

        {
          title:
            "Operational Intelligence",
          progress:
            data.operationalScore ||
            88,
          reward:
            "AI Runtime Mastery",
          icon:
            Brain,
          color:
            "text-violet-300",
        },

        {
          title:
            "Guest Experience Consistency",
          progress:
            data.venueMood?.includes(
              "luxury"
            )
              ? 96
              : 78,
          reward:
            "VIP Experience Certification",
          icon:
            Trophy,
          color:
            "text-cyan-300",
        },

      ];

      setGoals(
        generated
      );

    } catch (err) {

      console.error(err);

    }

  }

  return (

    <div className="min-h-screen bg-black px-5 py-10 text-white">

      <div className="mx-auto max-w-6xl">

        <div className="mb-10">

          <div className="text-[11px] uppercase tracking-[0.35em] text-fuchsia-300">
            Churchill Growth Engine
          </div>

          <div className="mt-3 flex items-center gap-3 text-5xl font-black">

            <Target className="h-10 w-10 text-fuchsia-300" />

            Live Goals

          </div>

          <div className="mt-3 text-white/40">
            AI-tracked progression, hospitality evolution and operational growth.
          </div>

        </div>

        <div className="space-y-5">

          {goals.map(
            (
              item,
              index
            ) => {

              const Icon =
                item.icon;

              return (

                <div
                  key={index}
                  className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6"
                >

                  <div className="flex items-center justify-between">

                    <div className="flex items-center gap-5">

                      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-black/40">

                        <Icon className={`h-8 w-8 ${item.color}`} />

                      </div>

                      <div>

                        <div className="text-2xl font-black">
                          {item.title}
                        </div>

                        <div className="mt-2 text-white/40">
                          Reward: {item.reward}
                        </div>

                      </div>

                    </div>

                    <div className={`text-5xl font-black ${item.color}`}>

                      {item.progress}%

                    </div>

                  </div>

                  <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">

                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500"
                      style={{
                        width:
                          `${item.progress}%`,
                      }}
                    />

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
