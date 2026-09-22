"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  Clock3,
  KeyRound,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import captureClockInLocation from "@/lib/people/workforce/captureClockInLocation";
import verifyClockInPasskey from "@/lib/people/workforce/verifyClockInPasskey";

const PAYMENT_COMPLETE_STATUSES = new Set([
  "PAID",
  "DISPUTED",
  "RESOLVED",
  "FINALIZED",
  "ACCOUNTING_CLOSED",
  "CERTIFIED",
  "ARCHIVED",
]);

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
  const [requests, setRequests] = useState({ timeOffRequests: [], swapRequests: [], incomingSwapRequests: [] });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [runtimeResponse, profileResponse, requestsResponse] = await Promise.all([
        fetch("/api/staff/runtime", { cache: "no-store" }),
        fetch("/api/staff/profile-overview", { cache: "no-store" }),
        fetch("/api/staff/workforce-requests", { cache: "no-store" }),
      ]);

      const [runtimeResult, profileResult, requestsResult] = await Promise.all([
        runtimeResponse.json(),
        profileResponse.json(),
        requestsResponse.json(),
      ]);

      if (!runtimeResponse.ok || !runtimeResult?.success) {
        throw new Error(runtimeResult?.error || "Unable to load staff runtime");
      }

      if (!profileResponse.ok || !profileResult?.success) {
        throw new Error(profileResult?.error || "Unable to load staff profile");
      }
      if (!requestsResponse.ok || !requestsResult?.success) {
        throw new Error(requestsResult?.error || "Unable to load staff requests");
      }

      setRuntime(runtimeResult);
      setProfile(profileResult.profile || null);
      setRequests(requestsResult || { timeOffRequests: [], swapRequests: [], incomingSwapRequests: [] });
    } catch (loadError) {
      setError(loadError?.message || "Unable to load staff portal");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const latestPayroll = profile?.payroll?.[0] || null;
  const compensation = profile?.compensation || null;
  const compensationConfigured = Boolean(compensation?.configured);
  const compensationCurrency =
    compensation?.currency_code || compensation?.currency || "";
  const latestPayrollCurrency =
    latestPayroll?.currency_code ||
    latestPayroll?.legal_entity?.currency ||
    compensationCurrency;
  const latestPayrollPaid = Boolean(
    latestPayroll && PAYMENT_COMPLETE_STATUSES.has(latestPayroll.status)
  );
  const staff = profile?.staff || runtime?.staff || null;
  const schedule = runtime?.schedule || null;
  const timezone = profile?.timezone || runtime?.timezone || "UTC";
  const upcomingSchedules = useMemo(() => profile?.upcomingSchedules || [], [profile?.upcomingSchedules]);
  const recentAttendance = profile?.recentAttendance || [];
  const requirements = runtime?.clockInRequirements || {};
  const activationBypass = String(staff?.role || runtime?.role || "").toUpperCase() === "SUPER_ADMIN";
  const identitySatisfied = activationBypass || requirements.identityVerified === true;
  const approvedTargets = new Set(
    requirements?.exception?.activeApprovedTargets || []
  );
  const pendingTargets = requirements?.exception?.pendingTargets || [];
  const passkeyExceptionApproved = approvedTargets.has("passkey");
  const gpsExceptionApproved = approvedTargets.has("gps");
  const exceptionApproved = passkeyExceptionApproved || gpsExceptionApproved;
  const latestException = requirements?.exception?.latest || null;

  const shiftLabel = useMemo(() => {
    if (runtime?.shiftActive) return "Clocked in";
    if (runtime?.shiftStatus === "LATE") return "Shift waiting · late";
    if (runtime?.shiftStatus === "UPCOMING") return "Upcoming shift";
    if (runtime?.shiftStatus === "NO_SHIFT") return "No scheduled shift";
    return runtime?.shiftStatus || "Not clocked in";
  }, [runtime]);

  const recentUpdates = useMemo(() => {
    const items = [];
    for (const row of (requests?.timeOffRequests || []).slice(0, 8)) {
      items.push({ id: `time-off:${row.id}`, title: `Time off · ${row.leave_type || "Request"}`, status: row.status || "PENDING", at: row.updated_at || row.requested_at || row.created_at || null });
    }
    for (const row of (requests?.swapRequests || []).slice(0, 8)) {
      items.push({ id: `swap:${row.id}`, title: "Shift swap request", status: row.status || "PENDING", at: row.updated_at || row.requested_at || row.created_at || null });
    }
    for (const row of (requests?.incomingSwapRequests || []).slice(0, 8)) {
      items.push({ id: `incoming-swap:${row.id}`, title: "Shift swap needs your response", status: row.status || "PENDING", at: row.updated_at || row.requested_at || row.created_at || null });
    }
    if (latestPayroll) {
      items.push({ id: `payroll:${latestPayroll.id || latestPayroll.payroll_month}`, title: `Payroll · ${latestPayroll.payroll_month || "Latest"}`, status: latestPayroll.payout_status || latestPayroll.status || "READY", at: latestPayroll.payout_date || latestPayroll.employee_acknowledged_at || null });
    }
    for (const row of upcomingSchedules.slice(0, 3)) {
      items.push({ id: `schedule:${row.id}`, title: `Shift · ${dateOnly(row.shift_date)}`, status: row.status || row.shift_type || "SCHEDULED", at: row.shift_date ? `${row.shift_date}T00:00:00.000Z` : null });
    }
    return items.filter((item) => item.at).sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0)).slice(0, 10);
  }, [requests, latestPayroll, upcomingSchedules]);

  async function changeShift(action) {
    setWorking(true);
    setError("");
    setMessage("");

    try {
      const currentRequirements = runtime?.clockInRequirements || {};
      const currentApprovedTargets = new Set(
        currentRequirements?.exception?.activeApprovedTargets || []
      );
      const passkeyApproved = currentApprovedTargets.has("passkey");
      const gpsApproved = currentApprovedTargets.has("gps");

      if (action === "clock_in" && !activationBypass && currentRequirements.identityVerified !== true) {
        throw new Error(
          currentRequirements.identityStatus === "PENDING"
            ? "Your passport or ID is waiting for verification before you can clock in"
            : "Upload and verify your passport or government ID in Staff Profile before you can clock in"
        );
      }

      if (
        action === "clock_in" &&
        currentRequirements.passkeyRequired &&
        !passkeyApproved
      ) {
        if (!currentRequirements.passkeyEnrolled) {
          throw new Error(
            "Register a passkey in Staff Profile before starting your shift"
          );
        }

        await verifyClockInPasskey();
      }

      const location =
        action === "clock_in" &&
        currentRequirements.gpsRequired &&
        !gpsApproved
          ? await captureClockInLocation()
          : null;

      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, location }),
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
    <main className="min-h-screen bg-[#F7F6F3] p-4 text-[#1B1A18] sm:p-5 lg:p-10">
      <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
        <section className="overflow-hidden rounded-[26px] border border-black/[0.075] bg-white shadow-[0_12px_34px_rgba(55,47,38,0.06)] sm:rounded-[34px]">
          <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A] to-transparent" />
          <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.34em] text-[#D6A66A]">
                <ShieldCheck className="h-4 w-4" /> Staff Portal
              </div>
              <h1 className="mt-2 text-2xl font-black tracking-[-0.03em] sm:mt-3 sm:text-4xl">{staff?.name || "My Work"}</h1>
              <p className="mt-2 text-sm text-[#817B73]">
                {staff?.role || runtime?.role || "Staff"} · your shifts, attendance and payroll in one secure view.
              </p>
            </div>

            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="hidden h-12 items-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-4 text-xs font-black uppercase tracking-[0.16em] text-[#4F4A43] disabled:opacity-40 sm:flex"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-[#984C43]">{error}</div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-[#5E6D58]">{message}</div>
        ) : null}

        {loading ? (
          <section className="rounded-[30px] border border-black/[0.075] bg-white p-6 text-sm text-[#817B73]">Loading staff portal...</section>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
              <article className="rounded-[26px] border border-black/[0.075] bg-white p-4 shadow-[0_10px_28px_rgba(55,47,38,0.05)] sm:rounded-[30px] sm:p-5 lg:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#948E86]">
                      <Clock3 className="h-4 w-4" /> Today
                    </div>
                    <h2 className="mt-2 text-2xl font-black">{shiftLabel}</h2>
                    <p className="mt-2 text-sm text-[#8A847C]">
                      {schedule
                        ? `${schedule.start_time || "-"} – ${schedule.end_time || "-"}`
                        : "No shift schedule is assigned for today. If you clock in, Avantiqo records an unscheduled shift for manager approval."}
                    </p>
                    {runtime?.activeShift?.clock_in ? (
                      <p className="mt-2 text-xs text-[#A09A92]">Started {dateTime(runtime.activeShift.clock_in, timezone)} · elapsed {runtime.shiftDuration || "00:00"}</p>
                    ) : null}

                    {!runtime?.shiftActive && exceptionApproved ? (
                      <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-3 text-xs text-[#76583A]">
                        <div className="flex items-center gap-2 font-black">
                          <AlertTriangle className="h-3.5 w-3.5" /> Manager exception approved · one-time
                        </div>
                        <div className="mt-1 text-[#8A6A3E]">
                          {[passkeyExceptionApproved ? "Passkey" : null, gpsExceptionApproved ? "GPS" : null]
                            .filter(Boolean)
                            .join(" + ")}
                          {latestException?.expiresAt
                            ? ` · expires ${dateTime(latestException.expiresAt, timezone)}`
                            : ""}
                        </div>
                      </div>
                    ) : null}

                    {!runtime?.shiftActive && pendingTargets.length && !exceptionApproved ? (
                      <p className="mt-2 flex items-center gap-2 text-xs text-[#8A6A3E]">
                        <AlertTriangle className="h-3.5 w-3.5" /> Manager exception pending for {pendingTargets.join(" + ")}.
                      </p>
                    ) : null}

                    {!runtime?.shiftActive && schedule && requirements.passkeyRequired && !passkeyExceptionApproved ? (
                      <p className="mt-2 flex items-center gap-2 text-xs text-[#746A86]">
                        <KeyRound className="h-3.5 w-3.5" />
                        {requirements.passkeyEnrolled
                          ? "Identity verification will be required before clock-in."
                          : "Register a passkey in Staff Profile before clock-in."}
                      </p>
                    ) : null}
                    {!runtime?.shiftActive && !identitySatisfied ? (
                      <Link href="/staff/profile" className="mt-3 flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2.5 text-xs font-semibold text-[#76583A]">
                        <ShieldCheck className="h-4 w-4" />
                        {requirements.identityStatus === "PENDING" ? "Passport / ID verification pending" : requirements.identityStatus === "REJECTED" ? "Passport / ID rejected · upload a valid document" : requirements.identityStatus === "EXPIRED" ? "Passport / ID expired · upload a current document" : "Passport / ID verification required"}
                      </Link>
                    ) : null}
                    {!runtime?.shiftActive && requirements.gpsRequired && !gpsExceptionApproved ? (
                      <p className="mt-2 flex items-center gap-2 text-xs text-[#647C7D]">
                        <MapPin className="h-3.5 w-3.5" /> GPS location will be verified before clock-in.
                      </p>
                    ) : null}
                    {!runtime?.shiftActive && schedule && (requirements.passkeyRequired || requirements.gpsRequired) ? (
                      <Link
                        href="/staff/profile"
                        className="mt-3 inline-flex text-[10px] font-black uppercase tracking-[0.12em] text-[#948E86] underline decoration-black/15 underline-offset-4"
                      >
                        Verification problem? Request manager exception
                      </Link>
                    ) : null}
                  </div>
                  <CalendarDays className="h-6 w-6 text-[#D6A66A]" />
                </div>

                <button
                  type="button"
                  onClick={() => changeShift(runtime?.shiftActive ? "clock_out" : "clock_in")}
                  disabled={working || (!runtime?.shiftActive && !identitySatisfied)}
                  className={`mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black uppercase tracking-[0.14em] shadow-[0_10px_26px_rgba(214,166,106,0.18)] disabled:opacity-40 ${runtime?.shiftActive ? "border border-red-400/25 bg-red-400/10 text-[#984C43]" : "bg-[#D6A66A] text-[#171614]"}`}
                >
                  {runtime?.shiftActive ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                  {working
                    ? !runtime?.shiftActive && requirements.passkeyRequired && !passkeyExceptionApproved
                      ? "Verifying identity..."
                      : !runtime?.shiftActive && requirements.gpsRequired && !gpsExceptionApproved
                        ? "Verifying location..."
                        : "Starting shift..."
                    : runtime?.shiftActive
                      ? "Clock out"
                      : "Clock in"}
                </button>
              </article>

              <article className="hidden rounded-[30px] border border-black/[0.075] bg-white p-5 lg:block lg:p-6">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#948E86]">
                  <UserRound className="h-4 w-4" /> Employment
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Metric label="Role" value={staff?.role || "-"} />
                  <Metric label="Payroll" value={latestPayroll?.status || "No payroll"} />
                  <Metric label="Salary type" value={compensation?.salary_type || "-"} />
                  <Metric label="Currency" value={compensationCurrency || "-"} />
                </div>
                {!compensationConfigured ? (
                  <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-4 text-xs leading-5 text-[#76583A]">
                    Compensation amount is not configured yet. Payroll will use the approved compensation profile once management enters it.
                  </div>
                ) : null}
              </article>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-[26px] border border-black/[0.075] bg-white p-4 shadow-[0_10px_28px_rgba(55,47,38,0.05)] sm:rounded-[30px] sm:p-5 lg:p-6">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]">
                  <CalendarDays className="h-4 w-4" /> Upcoming roster
                </div>
                <h2 className="mt-2 text-xl font-black">Next 14 days</h2>

                <div className="mt-4 space-y-2">
                  {upcomingSchedules.length ? (
                    upcomingSchedules.slice(0, 8).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-4">
                        <div>
                          <div className="text-sm font-black">{dateOnly(item.shift_date)}</div>
                          <div className="mt-1 text-xs text-[#948E86]">{item.department || item.section || staff?.department || "Scheduled shift"}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-[#D6A66A]">{item.start_time || "-"} – {item.end_time || "-"}</div>
                          <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-[#AAA49C]">{item.status || item.shift_type || "Scheduled"}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-4 text-sm text-[#948E86]">No upcoming shifts are scheduled.</div>
                  )}
                </div>
              </article>

              <article className="rounded-[26px] border border-black/[0.075] bg-white p-4 shadow-[0_10px_28px_rgba(55,47,38,0.05)] sm:rounded-[30px] sm:p-5 lg:p-6">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#647C7D]">
                  <Clock3 className="h-4 w-4" /> Attendance
                </div>
                <h2 className="mt-2 text-xl font-black">Recent workdays</h2>

                <div className="mt-4 space-y-2">
                  {recentAttendance.length ? (
                    recentAttendance.slice(0, 8).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-4">
                        <div>
                          <div className="text-sm font-black">{dateOnly(item.shift_date)}</div>
                          <div className="mt-1 text-xs text-[#948E86]">
                            {item.actual_start ? `In ${dateTime(item.actual_start, timezone)}` : "No clock-in"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5952]">{item.attendance_status || "Recorded"}</div>
                          <div className={`mt-1 text-[10px] ${Number(item.late_minutes || 0) > 0 ? "text-amber-200" : "text-[#5E6D58]"}`}>
                            {Number(item.late_minutes || 0) > 0 ? `${item.late_minutes} min late` : "On time"}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-4 text-sm text-[#948E86]">No attendance history is recorded yet.</div>
                  )}
                </div>
              </article>
            </section>

            <section className="rounded-[30px] border border-black/[0.075] bg-white p-5 lg:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]">
                    <RefreshCw className="h-4 w-4" /> Recent updates
                  </div>
                  <h2 className="mt-2 text-xl font-black">What changed for you</h2>
                </div>
                <Link href="/staff/requests" className="text-[10px] font-black uppercase tracking-[0.14em] text-[#948E86] underline decoration-black/15 underline-offset-4">Requests</Link>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {recentUpdates.length ? recentUpdates.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-4">
                    <div className="text-sm font-black">{item.title}</div>
                    <div className="text-right">
                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#716B64]">{item.status}</div>
                      <div className="mt-1 text-[9px] text-[#AAA49C]">{dateTime(item.at, timezone)}</div>
                    </div>
                  </div>
                )) : <div className="rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-4 text-sm text-[#948E86]">No recent staff updates.</div>}
              </div>
            </section>

            <section className="rounded-[30px] border border-black/[0.075] bg-white p-5 lg:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#66775F]">
                    <Banknote className="h-4 w-4" /> Latest Payroll
                  </div>
                  <h2 className="mt-2 text-2xl font-black">{latestPayroll?.payroll_month || "No payroll record yet"}</h2>
                  {latestPayroll ? (
                    <>
                      <div className="mt-3 text-3xl font-black text-[#D6A66A]">{money(latestPayroll.final_salary, latestPayrollCurrency)}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em]">
                        <span className="rounded-full border border-black/[0.075] bg-white px-3 py-1 text-[#67615A]">{latestPayroll.status || "-"}</span>
                        <span className="rounded-full border border-black/[0.075] bg-white px-3 py-1 text-[#67615A]">{latestPayroll.payout_status || "PENDING"}</span>
                        {latestPayroll.legal_entity?.name ? (
                          <span className="rounded-full border border-black/[0.075] bg-white px-3 py-1 text-[#67615A]">{latestPayroll.legal_entity.name}</span>
                        ) : null}
                      </div>
                      {latestPayrollPaid ? (
                        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4 text-sm text-emerald-100">
                          Paid {latestPayroll.payout_date || "-"}
                          {latestPayroll.payment_reference ? ` · Ref ${latestPayroll.payment_reference}` : ""}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-[#948E86]">Your payroll history will appear here after management generates payroll for your organization and legal entity.</p>
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
    <div className="rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-3">
      <div className="text-[9px] uppercase tracking-[0.16em] text-[#A09A92]">{label}</div>
      <div className="mt-2 truncate text-sm font-black">{value}</div>
    </div>
  );
}
