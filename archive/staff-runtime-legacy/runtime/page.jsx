"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Activity,
  Brain,
  Sparkles,
  Flame,
  Crown,
} from "lucide-react";

export default function StaffRuntimePage() {

  const [runtime, setRuntime] =
    useState(null);

  const [feed, setFeed] =
    useState([]);

  useEffect(() => {

    loadRuntime();

  }, []);

  async function loadRuntime() {

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
                "Generate realtime operational runtime.",
            }),
          }
        );

      const data =
        await res.json();

      setRuntime({

        ai:
          data.runtimeLevel ||
          "ACTIVE",

        mood:
          data.venueMood ||
          "Stable Runtime",

        pressure:
          data.pressureLevel ||
          "Controlled",

        service:
          data.nightlifePhase ||
          "Luxury",

      });

      setFeed(
        data.realtimeFeed ||
        data.notifications ||
        []
      );

    } catch (err) {

      console.error(err);

    }

  }

  return (

    <div className="min-h-screen bg-black px-5 py-10 text-white">

      <div className="mx-auto max-w-6xl">

        <div className="mb-10">

          <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300">
            Churchill Runtime
          </div>

          <div className="mt-3 flex items-center gap-3 text-5xl font-black">

            <Activity className="h-10 w-10 text-cyan-300" />

            Live Runtime

          </div>

          <div className="mt-3 text-white/40">
            Realtime venue intelligence and operational awareness.
          </div>

        </div>

        {runtime && (

          <div className="grid gap-4 md:grid-cols-4">

            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">

              <Brain className="h-7 w-7 text-violet-300" />

              <div className="mt-4 text-sm uppercase tracking-[0.25em] text-white/40">
                AI
              </div>

              <div className="mt-2 text-2xl font-black text-violet-300">
                {runtime.ai}
              </div>

            </div>

            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">

              <Sparkles className="h-7 w-7 text-cyan-300" />

              <div className="mt-4 text-sm uppercase tracking-[0.25em] text-white/40">
                Mood
              </div>

              <div className="mt-2 text-2xl font-black text-cyan-300">
                {runtime.mood}
              </div>

            </div>

            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">

              <Flame className="h-7 w-7 text-fuchsia-300" />

              <div className="mt-4 text-sm uppercase tracking-[0.25em] text-white/40">
                Pressure
              </div>

              <div className="mt-2 text-2xl font-black text-fuchsia-300">
                {runtime.pressure}
              </div>

            </div>

            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">

              <Crown className="h-7 w-7 text-amber-300" />

              <div className="mt-4 text-sm uppercase tracking-[0.25em] text-white/40">
                Service
              </div>

              <div className="mt-2 text-2xl font-black text-amber-300">
                {runtime.service}
              </div>

            </div>

          </div>

        )}

        <div className="mt-8 rounded-[32px] border border-white/10 bg-white/[0.04] p-6">

          <div className="text-2xl font-bold">
            Runtime Feed
          </div>

          <div className="mt-6 space-y-4">

            {feed.map(
              (
                item,
                index
              ) => (

                <div
                  key={index}
                  className="rounded-[24px] border border-white/10 bg-black/40 p-5"
                >

                  <div className="text-lg font-semibold">
                    {item.title || item.message}
                  </div>

                  <div className="mt-2 text-sm text-white/40">
                    {item.type || item.mood}
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
