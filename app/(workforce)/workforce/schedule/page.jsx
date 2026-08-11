"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, RefreshCw } from "lucide-react";

function formatDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function WorkforceSchedulePage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/staff/profile-overview", {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load schedule");
      }

      setProfile(result.profile || null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load schedule");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const schedules = useMemo(
    () => profile?.upcomingSchedules || [],
    [profile]
  );

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[38px] border border-white/10 bg-white/[0.06] backdrop-blur-3xl">
        <div className="h-[2px] bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500" />
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-300">
                Workforce Schedule
              </div>
              <div className="mt-3 text-4xl font-black">My Schedule</div>
              <div className="mt-2 text-sm text-white/45">
                Your upcoming assigned shifts for this organization.
              </div>
            </div>

            <button
              type="button"
              onClick={load}
              className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-white/60 transition hover:text-white"
              aria-label="Refresh schedule"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-[28px] border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </section>
      ) : null}

      {loading ? (
        <section className="rounded-[30px] border border-white/10 bg-white/[0.05] p-5 text-sm text-white/50">
          Loading schedule...
        </section>
      ) : schedules.length ? (
        <section className="space-y-3">
          {schedules.map((shift) => (
            <div
              key={shift.id}
              className="rounded-[30px] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-3xl"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-cyan-500/10 text-cyan-300">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-black">{formatDate(shift.shift_date)}</div>
                    <div className="mt-1 truncate text-sm text-white/45">
                      {shift.shift_type || "Assigned shift"}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="flex items-center justify-end gap-2 text-sm font-black text-white">
                    <Clock3 className="h-4 w-4 text-cyan-300" />
                    {shift.start_time} - {shift.end_time}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/35">
                    {shift.status || "Scheduled"}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section className="rounded-[30px] border border-white/10 bg-white/[0.05] p-5 text-sm text-white/45">
          No upcoming shifts are assigned.
        </section>
      )}
    </div>
  );
}
