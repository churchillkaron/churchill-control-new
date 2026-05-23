"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Trophy,
  Crown,
  Sparkles,
  Flame,
  Star,
  Brain,
} from "lucide-react";

export default function StaffAchievementsPage() {

  const [runtime, setRuntime] =
    useState(null);

  const [achievements, setAchievements] =
    useState([]);

  useEffect(() => {

    loadAchievements();

  }, []);

  async function loadAchievements() {

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
                "Analyze staff achievements and hospitality milestones.",
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
            "VIP Whisperer",
          description:
            data.venueMood ||
            "High luxury guest awareness detected.",
          level:
            data.runtimeLevel ||
            "Elite",
          icon:
            Crown,
          color:
            "text-amber-300",
        },

        {
          title:
            "AI Translator",
          description:
            "Realtime multilingual communication runtime active.",
          level:
            "Advanced",
          icon:
            Sparkles,
          color:
            "text-cyan-300",
        },

        {
          title:
            "Revenue Aura",
          description:
            "AI detects premium upselling behavior and nightlife timing.",
          level:
            data.pressureLevel ||
            "Luxury",
          icon:
            Flame,
          color:
            "text-fuchsia-300",
        },

        {
          title:
            "Operational Intelligence",
          description:
            "Churchill runtime orchestration synchronized successfully.",
          level:
            data.nightlifePhase ||
            "Active",
          icon:
            Brain,
          color:
            "text-violet-300",
        },

        {
          title:
            "Service Consistency",
          description:
            "Stable hospitality execution during operational flow.",
          level:
            "Professional",
          icon:
            Star,
          color:
            "text-emerald-300",
        },

      ];

      setAchievements(
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

          <div className="text-[11px] uppercase tracking-[0.35em] text-amber-300">
            Churchill Recognition
          </div>

          <div className="mt-3 flex items-center gap-3 text-5xl font-black">

            <Trophy className="h-10 w-10 text-amber-300" />

            Live Achievements

          </div>

          <div className="mt-3 text-white/40">
            AI-detected hospitality milestones and operational recognition.
          </div>

        </div>

        <div className="grid gap-5 md:grid-cols-2">

          {achievements.map(
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

                  <div className="flex items-start justify-between">

                    <div>

                      <div className="text-sm uppercase tracking-[0.25em] text-white/40">
                        {item.level}
                      </div>

                      <div className="mt-3 text-3xl font-black text-white">
                        {item.title}
                      </div>

                    </div>

                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-black/40">

                      <Icon className={`h-8 w-8 ${item.color}`} />

                    </div>

                  </div>

                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-white/70">
                    {item.description}
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
