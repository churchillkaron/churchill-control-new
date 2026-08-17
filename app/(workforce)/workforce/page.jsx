"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  KeyRound,
  MapPin,
  Play,
  ShieldCheck,
  Sparkles,
  Square,
  Users,
  Wallet,
} from "lucide-react";
import captureClockInLocation from "@/lib/people/workforce/captureClockInLocation";
import verifyClockInPasskey from "@/lib/people/workforce/verifyClockInPasskey";

const supportCards = [
  {
    title: "Schedule",
    subtitle: "Shifts and roster",
    href: "/workforce/schedule",
    icon: CalendarDays,
  },
  {
    title: "Payroll",
    subtitle: "Salary and history",
    href: "/workforce/payroll",
    icon: Wallet,
  },
  {
    title: "Tasks",
    subtitle: "Other assigned tasks",
    href: "/workforce/tasks",
    icon: Users,
  },
  {
    title: "Documents",
    subtitle: "Payslips, contracts and files",
    href: "/workforce/documents",
    icon: FileText,
  },
  {
    title: "Training",
    subtitle: "Courses and certifications",
    href: "/workforce/training",
    icon: ShieldCheck,
  },
  {
    title: "Profile",
    subtitle: "Employment and personal details",
    href: "/workforce/profile",
    icon: FileText,
  },
];

function dateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function jobTime(value) {
  if (!value) return "Flexible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Flexible";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function PortalHomePage() {
  const [staff, setStaff] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [myDay, setMyDay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingShift, setLoadingShift] = useState(false);
  const [error, setError] = useState("");

  async function loadPortal() {
    setLoading(true);
    setError("");

    try {
      const [runtimeResponse, myDayResponse] = await Promise.all([
        fetch("/api/staff/runtime", { cache: "no-store" }),
        fetch("/api/staff/my-day", { cache: "no-store" }),
      ]);

      const runtimeData = await runtimeResponse.json();
      const myDayData = await myDayResponse.json();

      if (!runtimeResponse.ok || !runtimeData?.success) {
        throw new Error(runtimeData?.error || "Unable to load workforce portal");
      }

      setStaff(runtimeData.staff || null);
      setRuntime(runtimeData);
      setMyDay(myDayResponse.ok && myDayData?.success ? myDayData : null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load workforce portal");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPortal();
  }, []);

  async function runShiftAction(action) {
    setLoadingShift(true);
    setError("");

    try {
      const requirements = runtime?.clockInRequirements || {};
      const approvedTargets = new Set(
        requirements?.exception?.activeApprovedTargets || []
      );
      const passkeyExceptionApproved = approvedTargets.has("passkey");
      const gpsExceptionApproved = approvedTargets.has("gps");

      if (
        action === "clock_in" &&
        requirements.passkeyRequired &&
        !passkeyExceptionApproved
      ) {
        if (!requirements.passkeyEnrolled) {
          throw new Error(
            "Register a passkey in Profile before starting your shift"
          );
        }

        await verifyClockInPasskey();
      }

      const location =
        action === "clock_in" &&
        requirements.gpsRequired &&
        !gpsExceptionApproved
          ? await captureClockInLocation()
          : null;

      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, location }),
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to update shift");
      }

      await loadPortal();
    } catch (actionError) {
      setError(actionError?.message || "Unable to update shift");
    } finally {
      setLoadingShift(false);
    }
  }

  const staffName = staff?.name || "Team Member";
  const staffInitial = staffName?.[0] || "?";
  const shiftActive = Boolean(runtime?.shiftActive);
  const shiftDuration = runtime?.shiftDuration || "00:00";
  const shiftStatus = runtime?.shiftStatus || "NO_SHIFT";
  const schedule = runtime?.schedule || null;
  const requirements = runtime?.clockInRequirements || {};
  const gpsRequired = Boolean(requirements.gpsRequired);
  const passkeyRequired = Boolean(requirements.passkeyRequired);
  const passkeyEnrolled = Boolean(requirements.passkeyEnrolled);
  const approvedTargets = new Set(
    requirements?.exception?.activeApprovedTargets || []
  );
  const pendingTargets = requirements?.exception?.pendingTargets || [];
  const latestException = requirements?.exception?.latest || null;
  const passkeyExceptionApproved = approvedTargets.has("passkey");
  const gpsExceptionApproved = approvedTargets.has("gps");
  const exceptionApproved = passkeyExceptionApproved || gpsExceptionApproved;
  const summary = myDay?.summary || { total: 0, completed: 0, remaining: 0 };
  const nextJob = myDay?.next || null;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-120px] top-[-120px] h-[360px] w-[360px] rounded-full bg-fuchsia-500/20 blur-[130px]" />
        <div className="absolute right-[-140px] top-[220px] h-[360px] w-[360px] rounded-full bg-cyan-500/15 blur-[130px]" />
      </div>

      <div className="relative z-10 space-y-4">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.06] shadow-[0_0_80px_rgba(168,85,247,0.12)] backdrop-blur-3xl">
          <div className="h-[2px] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400" />
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.34em] text-cyan-300">
                  Staff Portal
                </div>
                <div className="mt-3 text-3xl font-black leading-tight">
                  Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"},
                  <br />
                  {staffName}
                </div>
                <div className="mt-2 text-sm text-white/45">
                  {shiftActive
                    ? `${summary.remaining} work item${summary.remaining === 1 ? "" : "s"} left today.`
                    : `${summary.total} work item${summary.total === 1 ? "" : "s"} planned today.`}
                </div>
              </div>

              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white text-lg font-black text-black">
                {staff?.profile_picture ? (
                  <img
                    src={staff.profile_picture}
                    alt={staffName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  staffInitial
                )}
              </div>
            </div>

            {error ? (
              <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-3 gap-2">
              <StatusCard label="Status" value={loading ? "Loading" : shiftActive ? "On Shift" : shiftStatus} />
              <StatusCard label="Today" value={`${summary.completed}/${summary.total}`} />
              <StatusCard label="Shift" value={shiftDuration} />
            </div>
          </div>
        </section>

        <section className={`rounded-[32px] border p-4 ${shiftActive ? "border-cyan-400/25 bg-cyan-400/[0.07]" : "border-emerald-400/20 bg-emerald-400/[0.06]"}`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-cyan-300">
                <Clock3 className="h-4 w-4" /> {shiftActive ? "Shift Active" : "Today's Shift"}
              </div>
              <div className="mt-2 text-2xl font-black">
                {shiftActive
                  ? `Started ${dateTime(runtime?.activeShift?.clock_in) || "now"}`
                  : schedule
                    ? `${schedule.start_time} - ${schedule.end_time}`
                    : "No scheduled shift"}
              </div>
              <div className="mt-1 text-sm text-white/40">
                {shiftActive ? "Your workday is running." : schedule?.shift_type || "Check Schedule for upcoming shifts."}
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-white/55">
              {shiftStatus}
            </div>
          </div>

          {!shiftActive && exceptionApproved ? (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] px-3 py-3 text-xs text-amber-100/80">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-black">Manager exception approved · one-time</div>
                <div className="mt-1 text-amber-100/55">
                  {[passkeyExceptionApproved ? "Passkey" : null, gpsExceptionApproved ? "GPS" : null]
                    .filter(Boolean)
                    .join(" + ")}
                  {latestException?.expiresAt ? ` · expires ${dateTime(latestException.expiresAt)}` : ""}
                </div>
              </div>
            </div>
          ) : null}

          {!shiftActive && pendingTargets.length && !exceptionApproved ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-xs text-amber-100/65">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Manager exception pending for {pendingTargets.join(" + ")}.
            </div>
          ) : null}

          {!shiftActive && passkeyRequired && !passkeyExceptionApproved ? (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-violet-400/15 bg-violet-400/[0.06] px-3 py-2 text-xs text-violet-100/70">
              <KeyRound className="h-4 w-4 shrink-0" />
              {passkeyEnrolled
                ? "Identity verification is required before Start Shift."
                : "Register a passkey in Profile before Start Shift."}
            </div>
          ) : null}

          {!shiftActive && gpsRequired && !gpsExceptionApproved ? (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] px-3 py-2 text-xs text-cyan-100/70">
              <MapPin className="h-4 w-4 shrink-0" /> GPS is verified when you start your shift.
            </div>
          ) : null}

          {(passkeyRequired || gpsRequired) && !shiftActive ? (
            <Link
              href="/workforce/profile"
              className="mt-3 inline-flex text-[10px] font-black uppercase tracking-[0.13em] text-white/35 underline decoration-white/20 underline-offset-4"
            >
              Verification problem? Request a manager exception
            </Link>
          ) : null}

          <button
            type="button"
            onClick={() => runShiftAction(shiftActive ? "clock_out" : "clock_in")}
            disabled={loadingShift || loading || !staff}
            className={`mt-4 flex h-14 w-full items-center justify-center gap-3 rounded-[22px] text-sm font-black uppercase tracking-[0.18em] text-white disabled:opacity-40 ${
              shiftActive
                ? "border border-red-400/20 bg-red-500/15 text-red-100"
                : "bg-gradient-to-r from-emerald-500 to-cyan-500"
            }`}
          >
            {shiftActive ? <Square className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            {loadingShift
              ? !shiftActive && passkeyRequired && !passkeyExceptionApproved
                ? "Verifying identity..."
                : gpsRequired && !shiftActive && !gpsExceptionApproved
                  ? "Verifying location..."
                  : "Updating shift..."
              : shiftActive
                ? "End Shift"
                : "Start Shift"}
          </button>
        </section>

        <section className="overflow-hidden rounded-[34px] border border-violet-400/25 bg-gradient-to-br from-violet-500/15 via-white/[0.05] to-cyan-500/10">
          <div className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-violet-200">
                  <Sparkles className="h-4 w-4" /> My Day
                </div>
                <div className="mt-2 text-2xl font-black">
                  {nextJob ? "Your next assignment" : summary.total ? "Today's work" : "No assigned work"}
                </div>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-white/50">
                {summary.remaining} left
              </div>
            </div>

            {nextJob ? (
              <div className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">
                  {jobTime(nextJob.scheduledStart)} · {nextJob.actionNoun}
                </div>
                <div className="mt-2 text-xl font-black">{nextJob.customerName}</div>
                <div className="mt-1 text-sm text-white/45">{nextJob.serviceName}</div>
                {nextJob.locationName ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-white/40">
                    <MapPin className="h-4 w-4" /> {nextJob.locationName}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-3 rounded-[24px] border border-white/10 bg-black/20 p-4 text-sm text-white/45">
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                {summary.total ? "All assigned work is complete." : "Assignments will appear automatically when scheduled."}
              </div>
            )}

            <Link
              href="/workforce/my-day"
              className={`mt-4 flex h-14 w-full items-center justify-center gap-3 rounded-[22px] text-sm font-black uppercase tracking-[0.16em] ${
                shiftActive
                  ? "bg-gradient-to-r from-violet-500 to-cyan-500 text-white"
                  : "border border-white/10 bg-white/[0.04] text-white/45"
              }`}
            >
              {shiftActive ? "Continue My Day" : "View My Day"}
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          {supportCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="group rounded-[28px] border border-white/10 bg-white/[0.045] p-4 backdrop-blur-3xl transition hover:border-violet-400/35 hover:bg-violet-500/10"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[17px] border border-violet-500/20 bg-violet-500/10 text-violet-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/25" />
                </div>
                <div className="mt-3 text-base font-black">{card.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-white/40">{card.subtitle}</div>
              </Link>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function StatusCard({ label, value }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/30 p-3">
      <div className="text-[9px] uppercase tracking-[0.23em] text-white/35">{label}</div>
      <div className="mt-2 truncate text-sm font-black text-white">{value}</div>
    </div>
  );
}
