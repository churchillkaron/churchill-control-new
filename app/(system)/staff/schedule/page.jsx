"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  CalendarDays,
  Clock3,
  Crown,
  Sparkles,
  Activity,
} from "lucide-react";

export default function StaffSchedulePage() {

  const [runtime, setRuntime] =
    useState(null);

  const [schedule, setSchedule] =
    useState([]);

  useEffect(() => {

    loadSchedule();

  }, []);

  async function loadSchedule() {

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
                "Generate operational schedule runtime.",
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
          day:
            "Friday",
          shift:
            "18:00 - 02:00",
          mode:
            data.nightlifePhase ||
            "Peak Rush",
          energy:
            data.venueMood ||
            "Luxury Momentum",
          icon:
            Crown,
          color:
            "text-amber-300",
        },

        {
          day:
            "Saturday",
          shift:
            "19:00 - 03:00",
          mode:
            data.runtimeLevel ||
            "ELITE",
          energy:
            data.pressureLevel ||
            "Elevated",
          icon:
            Activity,
          color:
            "text-fuchsia-300",
        },

        {
          day:
            "Sunday",
          shift:
            "17:00 - 00:00",
          mode:
            "Recovery Flow",
          energy:
            "Controlled Luxury",
          icon:
            Sparkles,
          color:
            "text-cyan-300",
        },

      ];

      setSchedule(
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

          <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300">
            Churchill Operations
          </div>

          <div className="mt-3 flex items-center gap-3 text-5xl font-black">

            <CalendarDays className="h-10 w-10 text-cyan-300" />

            Schedule Runtime

          </div>

          <div className="mt-3 text-white/40">
            Live operational scheduling and nightlife shift intelligence.
          </div>

        </div>

        <div className="space-y-5">

          {schedule.map(
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

                        <div className="text-3xl font-black">
                          {item.day}
                        </div>

                        <div className="mt-2 flex items-center gap-2 text-white/40">

                          <Clock3 className="h-4 w-4" />

                          {item.shift}

                        </div>

                      </div>

                    </div>

                    <div className="text-right">

                      <div className={`text-2xl font-black ${item.color}`}>
                        {item.mode}
                      </div>

                      <div className="mt-2 text-white/40">
                        {item.energy}
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
