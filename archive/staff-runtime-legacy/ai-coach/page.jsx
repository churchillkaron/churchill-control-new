"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Brain,
  Sparkles,
  Crown,
  Languages,
  Flame,
} from "lucide-react";

export default function StaffAICoachPage() {

  const [memory, setMemory] =
    useState([]);

  const [runtime, setRuntime] =
    useState(null);

  useEffect(() => {

    loadCoach();

  }, []);

  async function loadCoach() {

    try {

      const runtimeRes =
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
                "Analyze staff coaching runtime.",
            }),
          }
        );

      const runtimeData =
        await runtimeRes.json();

      setRuntime(
        runtimeData
      );

      const memoryRes =
        await fetch(
          "/api/staff/ai-memory"
        );

      const memoryData =
        await memoryRes.json();

      setMemory(
        memoryData.memory ||
        []
      );

    } catch (err) {

      console.error(err);

    }

  }

  const coaching = [

    {
      title: "Guest Recovery",
      score:
        runtime?.operationalScore ||
        92,
      insight:
        "Churchill detects strong emotional recovery awareness.",
      icon: Crown,
      color: "text-amber-300",
    },

    {
      title: "Translation",
      score: 95,
      insight:
        "AI communication and multilingual runtime improving.",
      icon: Languages,
      color: "text-cyan-300",
    },

    {
      title: "Upselling",
      score: 84,
      insight:
        runtime?.venueMood ||
        "Luxury momentum active.",
      icon: Flame,
      color: "text-fuchsia-300",
    },

    {
      title: "AI Instinct",
      score:
        runtime?.runtimeLevel ===
        "ELITE"
          ? 98
          : 88,
      insight:
        runtime?.pressureLevel ||
        "Operational awareness stable.",
      icon: Brain,
      color: "text-violet-300",
    },

  ];

  return (

    <div className="min-h-screen bg-black px-5 py-10 text-white">

      <div className="mx-auto max-w-6xl">

        <div className="mb-10">

          <div className="text-[11px] uppercase tracking-[0.35em] text-violet-300">
            Churchill AI Coach
          </div>

          <div className="mt-3 flex items-center gap-3 text-5xl font-black">

            <Sparkles className="h-10 w-10 text-violet-300" />

            Adaptive Coaching Runtime

          </div>

          <div className="mt-3 text-white/40">
            Realtime hospitality intelligence and behavioral evolution.
          </div>

        </div>

        <div className="grid gap-5 md:grid-cols-2">

          {coaching.map(
            (
              item,
              index
            ) => {

              const Icon =
                item.icon;

              return (

                <div
                  key={index}
                  className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6"
                >

                  <div className="flex items-center justify-between">

                    <div>

                      <div className="text-sm uppercase tracking-[0.25em] text-white/40">
                        {item.title}
                      </div>

                      <div className={`mt-3 text-5xl font-black ${item.color}`}>
                        {item.score}%
                      </div>

                    </div>

                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-black/40">

                      <Icon className={`h-8 w-8 ${item.color}`} />

                    </div>

                  </div>

                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
                    {item.insight}
                  </div>

                </div>

              );

            }
          )}

        </div>

        <div className="mt-10 rounded-[34px] border border-violet-500/20 bg-violet-500/5 p-6">

          <div className="text-3xl font-black">
            AI Memory
          </div>

          <div className="mt-6 space-y-4">

            {memory.map(
              (
                item,
                index
              ) => (

                <div
                  key={index}
                  className="rounded-2xl border border-white/10 bg-black/30 p-5"
                >

                  <div className="text-lg font-semibold">
                    {item.title ||
                      "AI Learning"}
                  </div>

                  <div className="mt-2 text-white/50">
                    {item.memory ||
                      item.content ||
                      JSON.stringify(item)}
                  </div>

                </div>

              )
            )}

          </div>

        </div>

      </div>

    </div>

  );

}
