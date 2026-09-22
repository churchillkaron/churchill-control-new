"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, RefreshCw } from "lucide-react";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function StaffSchedulePage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/staff/profile-overview", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load schedule");
      setProfile(payload.profile || null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load schedule");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const schedules = useMemo(() => profile?.upcomingSchedules || [], [profile]);

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-4 text-[#1B1A18] sm:p-5 lg:p-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-[30px] border border-black/[0.075] bg-white p-5 shadow-[0_12px_34px_rgba(55,47,38,0.05)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#D6A66A]"><CalendarDays className="h-4 w-4" /> Workforce schedule</div>
              <h1 className="mt-3 text-3xl font-black tracking-[-0.03em]">My Schedule</h1>
              <p className="mt-2 text-sm text-[#817B73]">Your upcoming assigned shifts for the active organization.</p>
            </div>
            <button type="button" onClick={load} disabled={loading} aria-label="Refresh schedule" className="grid h-11 w-11 place-items-center rounded-2xl border border-black/[0.08] bg-[#FCFBF9] text-[#817B73] disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
        </section>

        {error ? <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-[#984C43]">{error}</div> : null}

        {loading ? (
          <div className="rounded-[26px] border border-black/[0.075] bg-white p-5 text-sm text-[#817B73]">Loading upcoming shifts…</div>
        ) : schedules.length ? (
          <section className="space-y-3">
            {schedules.map((shift) => (
              <article key={shift.id} className="rounded-[26px] border border-black/[0.075] bg-white p-4 shadow-[0_8px_24px_rgba(55,47,38,0.04)] sm:p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-[#F5F1EA] text-[#B27B3B]"><CalendarDays className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <div className="font-black">{formatDate(shift.shift_date)}</div>
                      <div className="mt-1 truncate text-sm text-[#8A847C]">{shift.shift_type || "Assigned shift"}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="flex items-center justify-end gap-2 text-sm font-black text-[#4F4A43]"><Clock3 className="h-4 w-4 text-[#D6A66A]" />{shift.start_time || "—"} – {shift.end_time || "—"}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[#AAA49C]">{shift.status || "Scheduled"}</div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="rounded-[26px] border border-dashed border-black/[0.09] bg-white p-8 text-center">
            <CalendarDays className="mx-auto h-7 w-7 text-[#B4AEA6]" />
            <div className="mt-3 font-black">No upcoming shifts assigned</div>
            <p className="mt-1 text-sm text-[#948E86]">New roster assignments will appear here automatically.</p>
          </section>
        )}
      </div>
    </main>
  );
}
