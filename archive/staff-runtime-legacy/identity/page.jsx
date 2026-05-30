"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Crown,
  Sparkles,
  Brain,
  Languages,
  Flame,
  Shield,
  Activity,
} from "lucide-react";

export default function StaffIdentityPage() {

  const [runtime, setRuntime] =
    useState(null);

  const [profile, setProfile] =
    useState(null);

  useEffect(() => {

    loadIdentity();

  }, []);

  async function loadIdentity() {

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
                "Analyze hospitality identity runtime.",
            }),
          }
        );

      const runtimeData =
        await runtimeRes.json();

      setRuntime(
        runtimeData
      );

      const profileRes =
        await fetch(
          "/api/staff/profile-overview?tenant_id=76e2caa6-dd78-49e5-b0f5-1ff94185c2d4&email=patric@harrysphuket.com"
        );

      const profileData =
        await profileRes.json();

      setProfile(
        profileData?.profile?.staff
      );

    } catch (err) {

      console.error(err);

    }

  }

  const traits = [

    {
      title:
        "Guest Psychology",
      value:
        runtime?.venueMood ||
        "Luxury Flow",
      icon:
        Brain,
      color:
        "text-violet-300",
    },

    {
      title:
        "Translation",
      value:
        "Adaptive",
      icon:
        Languages,
      color:
        "text-cyan-300",
    },

    {
      title:
        "Upselling",
      value:
        runtime?.runtimeLevel ||
        "Advanced",
      icon:
        Flame,
      color:
        "text-fuchsia-300",
    },

    {
      title:
        "Leadership",
      value:
        runtime?.pressureLevel ||
        "Controlled",
      icon:
        Shield,
      color:
        "text-emerald-300",
    },

  ];

  return (

    <div className="min-h-screen bg-black px-5 py-10 text-white">

      <div className="mx-auto max-w-6xl">

        <div className="overflow-hidden rounded-[40px] border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-black to-black p-8">

          <div className="flex items-center gap-6">

            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 via-fuchsia-500 to-cyan-400">

              <Crown className="h-14 w-14 text-white" />

            </div>

            <div>

              <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300">
                Churchill Identity Runtime
              </div>

              <div className="mt-3 text-6xl font-black">

                {profile?.name ||
                  "Staff Runtime"}

              </div>

              <div className="mt-3 text-white/40">

                {profile?.role ||
                  "STAFF"}

                {" · "}

                {runtime?.runtimeLevel ||
                  "Luxury"}

              </div>

            </div>

          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">

            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">

              <div className="text-sm uppercase tracking-[0.25em] text-white/40">
                Runtime
              </div>

              <div className="mt-3 flex items-center gap-2 text-3xl font-black text-cyan-300">

                <Activity className="h-7 w-7" />

                {runtime?.runtimeLevel ||
                  "ACTIVE"}

              </div>

            </div>

            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">

              <div className="text-sm uppercase tracking-[0.25em] text-white/40">
                Mood
              </div>

              <div className="mt-3 text-3xl font-black text-violet-300">

                {runtime?.venueMood ||
                  "Stable"}

              </div>

            </div>

            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">

              <div className="text-sm uppercase tracking-[0.25em] text-white/40">
                Pressure
              </div>

              <div className="mt-3 text-3xl font-black text-fuchsia-300">

                {runtime?.pressureLevel ||
                  "Controlled"}

              </div>

            </div>

            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">

              <div className="text-sm uppercase tracking-[0.25em] text-white/40">
                Nightlife
              </div>

              <div className="mt-3 text-3xl font-black text-amber-300">

                {runtime?.nightlifePhase ||
                  "Warmup"}

              </div>

            </div>

          </div>

        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">

          {traits.map(
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

                    <div>

                      <div className="text-sm uppercase tracking-[0.25em] text-white/40">
                        {item.title}
                      </div>

                      <div className={`mt-3 text-3xl font-black ${item.color}`}>
                        {item.value}
                      </div>

                    </div>

                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-black/40">

                      <Icon className={`h-8 w-8 ${item.color}`} />

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
