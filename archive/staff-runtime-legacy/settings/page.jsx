"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Globe,
  Mic,
  Volume2,
  Shield,
  Moon,
  Bell,
  Brain,
  Activity,
} from "lucide-react";

export default function StaffSettingsPage() {

  const [runtime, setRuntime] =
    useState(null);

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
                "Analyze settings and runtime environment.",
            }),
          }
        );

      const data =
        await res.json();

      setRuntime(
        data
      );

    } catch (err) {

      console.error(err);

    }

  }

  const settings = [

    {
      title: "Language Runtime",
      value: "Adaptive Translation",
      icon: Globe,
      color: "text-cyan-300",
    },

    {
      title: "Voice Runtime",
      value:
        runtime?.runtimeLevel ||
        "ACTIVE",
      icon: Mic,
      color: "text-fuchsia-300",
    },

    {
      title: "Audio Output",
      value:
        runtime?.venueMood ||
        "Luxury Runtime",
      icon: Volume2,
      color: "text-violet-300",
    },

    {
      title: "Security Layer",
      value:
        runtime?.pressureLevel ||
        "Protected",
      icon: Shield,
      color: "text-emerald-300",
    },

    {
      title: "Notifications",
      value: "Realtime Alerts",
      icon: Bell,
      color: "text-amber-300",
    },

    {
      title: "AI Orchestration",
      value:
        runtime?.nightlifePhase ||
        "Warmup",
      icon: Brain,
      color: "text-cyan-300",
    },

    {
      title: "System Runtime",
      value:
        runtime?.runtimeLevel ||
        "ONLINE",
      icon: Activity,
      color: "text-fuchsia-300",
    },

    {
      title: "Appearance",
      value: "Night Runtime",
      icon: Moon,
      color: "text-white",
    },

  ];

  return (

    <div className="min-h-screen bg-black px-5 py-10 text-white">

      <div className="mx-auto max-w-6xl">

        <div className="mb-10">

          <div className="text-[11px] uppercase tracking-[0.35em] text-violet-300">
            Churchill Preferences
          </div>

          <div className="mt-3 text-5xl font-black">
            Runtime Settings
          </div>

          <div className="mt-3 text-white/40">
            Live AI runtime environment and personalization settings.
          </div>

        </div>

        <div className="grid gap-5 md:grid-cols-2">

          {settings.map(
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

                      <div className={`mt-3 text-2xl font-black ${item.color}`}>
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
