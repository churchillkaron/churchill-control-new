"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CalendarDays,
  Clock3,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";

function money(value, currency = "") {
  const amount = Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return currency ? `${currency} ${amount}` : amount;
}

function dateTime(value, timezone = "UTC") {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dateOnly(value) {
  if (!value) return "-";

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
}

export default function StaffPortalPage() {
  const [runtime, setRuntime] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [runtimeResponse, profileResponse] = await Promise.all([
        fetch("/api/staff/runtime", { cache: "no-store" }),
        fetch("/api/staff/profile-overview", { cache: "no-store" }),
      ]);

      const [runtimeResult, profileResult] = await Promise.all([
        runtimeResponse.json(),
        profileResponse.json(),
      ]);

      if (!runtimeResponse.ok || !runtimeResult?.success) {
        throw new Error(runtimeResult?.error || "Unable to load staff runtime");
      }

      if (!profileResponse.ok || !profileResult?.success) {
        throw new Error(profileResult?.error || "Unable to load staff profile");
      }

      setRuntime(runtimeResult);
      setProfile(profileResult.profile || null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load staff portal");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const latestPayroll = profile?.payroll?.[0] || runtime?.latestPayroll || null;
  const compensation = profile?.compensation || null;
  const compensationConfigured = Boolean(compensation?.configured);
  const currency = compensation?.currency_code || compensation?.currency || "";
  const staff = profile?.staff || runtime?.staff || null;
  const schedule = runtime?.schedule || null;
  const timezone = profile?.timezone || runtime?.timezone || "UTC";
  const upcomingSchedules = profile?.upcomingSchedules || [];
  const recentAttendance = profile?.recentAttendance || [];

  const shiftLabel = useMemo(() => {
    if (runtime?.shiftActive) return "Clocked in";
    if (runtime?.shiftStatus === "LATE") return "Shift waiting · late";
    if (runtime?.shiftStatus === "UPCOMING") return "Upcoming shift";
    if (runtime?.shiftStatus === "NO_SHIFT") return "No scheduled shift";
    return runtime?.shiftStatus || "Not clocked in";
  }, [runtime]);

  async function changeShift(action) {
    setWorking(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to update shift");
      }

      setMessage(action === "clock_in" ? "Shift started." : "Shift completed.");
      await load();
    } catch (actionError) {
      setError(actionError?.message || "Unable to update shift");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#030303] p-5 text-white lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.045] backdrop-blur-3xl">
          <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A] to-transparent" />
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.34em] text-[#D6A66A]">
                <ShieldCheck className="h-4 w-4" /> Staff Portal
              </div>
              <h1 className="mt-3 text-4xl font-black">{staff?.name || runtime?.identity?.staffName || "My Work"}</h1>
              <p className="mt-2 text-sm text-white/45">
                {staff?.role || runtime?.role || "Staff"} · your shifts, attendance and payroll in one secure view.
              </p>
            </div>

            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-xs font-black uppercase tracking-[0.16em] text-white/70 disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>
        ) : null}

        {loading ? (
          <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6 text-sm text-white/45">Loading staff portal...</section>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
              <article className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/35">
                      <Clock3 className="h-4 w-4" /> Today
                    </div>
                    <h2 className="mt-2 text-2xl font-black">{shiftLabel}</h2>
                    <p className="mt-2 text-sm text-white/40">
                      {schedule
                        ? `${schedule.start_time || "-"} – ${schedule.end_time || "-"}`
                        : "No shift schedule is assigned for today."}
                    </p>
                    {runtime?.activeShift?.clock_in ? (
                      <p className="mt-2 text-xs text-white/30">Started {dateTime(runtime.activeShift.clock_in, timezone)} · elapsed {runtime.shiftDuration || "00:00"}</p>
                    ) : null}
                  </div>
                  <CalendarDays className="h-6 w-6 text-[#D6A66A]" />
                </div>

                <button
                  type="button"
                  onClick={() => changeShift(runtime?.shiftActive ? "clock_out" : "clock_in")}
                  disabled={working}
                  className={`mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-xs font-black uppercase tracking-[0.16em] disabled:opacity-40 ${runtime?.shiftActive ? "border border-red-400/25 bg-red-400/10 text-red-200" : "bg-[#D6A66A] text-black"}`}
                >
                  {runtime?.shiftActive ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                  {working ? "Updating..." : runtime?.shiftActive ? "Clock out" : "Clock in"}
                </button>
              </article>

              <article className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/35">
                  <UserRound className="h-4 w-4" /> Employment
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Metric label="Role" value={staff?.role || "-"} />
                  <Metric label="Payroll" value={latestPayroll?.status || "No payroll"} />
                  <Metric label="Salary type" value={compensation?.salary_type || "-"} />
                  <Metric label="Currency" value={currency || "-"} />
                </div>
                {!compensationConfigured ? (
                  <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-4 text-xs leading-5 text-amber-100/75">
                    Compensation amount is not configured yet. Payroll will use the approved compensation profile once management enters it.
                  </div>
                ) : null}
              </article>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]">
                  <CalendarDays className="h-4 w-4" /> Upcoming roster
                </div>
                <h2 className="mt-2 text-xl font-black">Next 14 days</h2>

                <div className="mt-4 space-y-2">
                  {upcomingSchedules.length ? (
                    upcomingSchedules.slice(0, 8).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                        <div>
                          <div className="text-sm font-black">{dateOnly(item.shift_date)}</div>
                          <div className="mt-1 text-xs text-white/35">{item.department || item.section || staff?.department || "Scheduled shift"}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-[#D6A66A]">{item.start_time || "-"} – {item.end_time || "-"}</div>
                          <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-white/25">{item.status || item.shift_type || "Scheduled"}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-sm text-white/35">No upcoming shifts are scheduled.</div>
                  )}
                </div>
              </article>

              <article className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">
                  <Clock3 className="h-4 w-4" /> Attendance
                </div>
                <h2 className="mt-2 text-xl font-black">Recent workdays</h2>

                <div className="mt-4 space-y-2">
                  {recentAttendance.length ? (
                    recentAttendance.slice(0, 8).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                        <div>
                          <div className="text-sm font-black">{dateOnly(item.shift_date)}</div>
                          <div className="mt-1 text-xs text-white/35">
                            {item.actual_start ? `In ${dateTime(item.actual_start, timezone)}` : "No clock-in"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-black uppercase tracking-[0.12em] text-white/65">{item.attendance_status || "Recorded"}</div>
                          <div className={`mt-1 text-[10px] ${Number(item.late_minutes || 0) > 0 ? "text-amber-200" : "text-emerald-200"}`}>
                            {Number(item.late_minutes || 0) > 0 ? `${item.late_minutes} min late` : "On time"}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-sm text-white/35">No attendance history is recorded yet.</div>
                  )}
                </div>
              </article>
            </section>

            <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-emerald-300/70">
                    <Banknote className="h-4 w-4" /> Latest Payroll
                  </div>
                  <h2 className="mt-2 text-2xl font-black">{latestPayroll?.payroll_month || "No payroll record yet"}</h2>
                  {latestPayroll ? (
                    <>
                      <div className="mt-3 text-3xl font-black text-[#D6A66A]">{money(latestPayroll.final_salary, currency)}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em]">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/60">{latestPayroll.status || "-"}</span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/60">{latestPayroll.payout_status || "PENDING"}</span>
                      </div>
                      {latestPayroll.status === "PAID" ? (
                        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4 text-sm text-emerald-100">
                          Paid {latestPayroll.payout_date || "-"}
                          {latestPayroll.payment_reference ? ` · Ref ${latestPayroll.payment_reference}` : ""}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-white/35">Your payroll history will appear here after management generates payroll for your organization and legal entity.</p>
                  )}
                </div>

                <Link
                  href="/staff/earnings"
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-6 text-xs font-black uppercase tracking-[0.16em] text-black"
                >
                  <Banknote className="h-4 w-4" /> My earnings
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
      <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</div>
      <div className="mt-2 truncate text-sm font-black">{value}</div>
    </div>
  );
}
