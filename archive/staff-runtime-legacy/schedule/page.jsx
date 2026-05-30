"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  CalendarDays,
  Clock3,
  Briefcase,
} from "lucide-react";

export default function StaffSchedulePage() {

  const [schedule, setSchedule] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    loadSchedule();

  }, []);

  async function loadSchedule() {

    try {

      const staffId =
        localStorage.getItem(
          "staff_id"
        );

      if (!staffId) return;

      const res =
        await fetch(
          `/api/schedule/my?staff_id=${staffId}`
        );

      const data =
        await res.json();

      setSchedule(
        data.schedules || []
      );

    } catch (err) {

      console.error(err);

    }

    setLoading(false);

  }

  function formatDate(date) {

    return new Date(
      date
    ).toLocaleDateString(
      "en-US",
      {
        weekday: "long",
        month: "short",
        day: "numeric",
      }
    );

  }

  return (

    <div className="min-h-screen bg-black px-5 py-10 text-white">

      <div className="mx-auto max-w-7xl">

        <div className="mb-10">

          <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300">
            Churchill Operations
          </div>

          <div className="mt-3 flex items-center gap-3 text-5xl font-black">

            <CalendarDays className="h-10 w-10 text-cyan-300" />

            My Schedule

          </div>

          <div className="mt-3 text-white/40">
            Live manager assigned operational shifts
          </div>

        </div>

        {loading && (
          <div className="text-white/40">
            Loading schedule...
          </div>
        )}

        {!loading &&
          schedule.length === 0 && (

          <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-10 text-center">

            <div className="text-2xl font-black">
              No shifts assigned
            </div>

            <div className="mt-3 text-white/40">
              Your manager has not published a schedule yet.
            </div>

          </div>

        )}

        <div className="space-y-5">

          {schedule.map(
            (
              item,
              index
            ) => (

              <div
                key={index}
                className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6 transition-all hover:scale-[1.01]"
              >

                <div className="flex items-center justify-between">

                  <div className="flex items-center gap-5">

                    <div
                      className="flex h-16 w-16 items-center justify-center rounded-3xl"
                      style={{
                        background:
                          item.color ||
                          "#3b82f6",
                      }}
                    >

                      <Briefcase className="h-8 w-8 text-white" />

                    </div>

                    <div>

                      <div className="text-3xl font-black">
                        {formatDate(
                          item.shift_date
                        )}
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-white/40">

                        <Clock3 className="h-4 w-4" />

                        {
                          item.start_time
                        }
                        {" - "}
                        {
                          item.end_time
                        }

                      </div>

                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-2xl font-black">
                      {
                        item.shift_type
                      }
                    </div>

                    <div className="mt-2 text-white/40">
                      {
                        item.department
                      }
                    </div>

                  </div>

                </div>

              </div>

            )
          )}

        </div>

      </div>

    </div>

  );

}
