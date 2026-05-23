"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Crown,
  Trophy,
  Flame,
  Sparkles,
  Brain,
} from "lucide-react";

export default function StaffLeaderboardPage() {

  const [leaders, setLeaders] =
    useState([]);

  useEffect(() => {

    loadLeaderboard();

  }, []);

  async function loadLeaderboard() {

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
              role: "MANAGEMENT",
              question:
                "Generate operational staff leaderboard.",
            }),
          }
        );

      const data =
        await res.json();

      const generated =
        [
          {
            name: "Patric",
            role: "SUPER_ADMIN",
            score:
              data.operationalScore || 98,
            aura:
              data.runtimeLevel || "ELITE",
            icon: Crown,
            color:
              "text-amber-300",
          },

          {
            name: "Churchill Runtime",
            role: "AI",
            score: 96,
            aura:
              data.venueMood || "Luxury",
            icon: Brain,
            color:
              "text-violet-300",
          },

          {
            name: "Revenue Engine",
            role: "OPERATIONS",
            score: 91,
            aura:
              data.pressureLevel || "Stable",
            icon: Flame,
            color:
              "text-fuchsia-300",
          },

        ];

      setLeaders(
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
            Churchill Ranking
          </div>

          <div className="mt-3 flex items-center gap-3 text-5xl font-black">

            <Trophy className="h-10 w-10 text-amber-300" />

            Live Leaderboard

          </div>

          <div className="mt-3 text-white/40">
            AI-driven hospitality ranking and operational performance runtime.
          </div>

        </div>

        <div className="space-y-5">

          {leaders.map(
            (
              person,
              index
            ) => {

              const Icon =
                person.icon;

              return (

                <div
                  key={index}
                  className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6"
                >

                  <div className="flex items-center justify-between">

                    <div className="flex items-center gap-5">

                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 via-fuchsia-500 to-cyan-400">

                        <Icon className="h-8 w-8 text-white" />

                      </div>

                      <div>

                        <div className="text-3xl font-black">

                          #{index + 1}
                          {" "}
                          {person.name}

                        </div>

                        <div className="mt-2 text-white/40">
                          {person.role}
                        </div>

                      </div>

                    </div>

                    <div className="text-right">

                      <div className={`text-5xl font-black ${person.color}`}>

                        {person.score}

                      </div>

                      <div className="mt-2 flex items-center justify-end gap-2 text-sm text-white/50">

                        <Sparkles className="h-4 w-4 text-cyan-300" />

                        {person.aura}

                      </div>

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
