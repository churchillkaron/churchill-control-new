"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot,
  CalendarDays,
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

const cards = [
  {
    title: "Schedule",
    subtitle: "Next shifts and roster",
    href: "/workforce/schedule",
    icon: CalendarDays,
  },
  {
    title: "Documents",
    subtitle: "Payslips, contracts and HR files",
    href: "/workforce/documents",
    icon: FileText,
  },
  {
    title: "Payroll",
    subtitle: "Salary, service charge and history",
    href: "/workforce/payroll",
    icon: Wallet,
  },
  {
    title: "Tasks",
    subtitle: "Assigned work and approvals",
    href: "/workforce/tasks",
    icon: Users,
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

export default function PortalHomePage() {
  const [staff, setStaff] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingShift, setLoadingShift] = useState(false);
  const [error, setError] = useState("");

  async function loadPortal() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/staff/runtime", {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to load workforce portal");
      }

      setStaff(data.staff || null);
      setRuntime(data);
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

      if (action === "clock_in" && requirements.passkeyRequired) {
        if (!requirements.passkeyEnrolled) {
          throw new Error(
            "Register a passkey in Profile before starting your shift"
          );
        }

        await verifyClockInPasskey();
      }

      const location =
        action === "clock_in" && requirements.gpsRequired
          ? await captureClockInLocation()
          : null;

      const response = await fetch("/api/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
  const gpsRequired = Boolean(runtime?.clockInRequirements?.gpsRequired);
  const passkeyRequired = Boolean(runtime?.clockInRequirements?.passkeyRequired);
  const passkeyEnrolled = Boolean(runtime?.clockInRequirements?.passkeyEnrolled);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-120px] top-[-120px] h-[360px] w-[360px] rounded-full bg-fuchsia-500/20 blur-[130px]" />
        <div className="absolute right-[-140px] top-[220px] h-[360px] w-[360px] rounded-full bg-cyan-500/15 blur-[130px]" />
        <div className="absolute bottom-[-160px] left-[20%] h-[420px] w-[420px] rounded-full bg-emerald-500/10 blur-[150px]" />
      </div>

      <div className="relative z-10 space-y-5">
        <section className="overflow-hidden rounded-[38px] border border-white/10 bg-white/[0.06] shadow-[0_0_80px_rgba(168,85,247,0.18)] backdrop-blur-3xl">
          <div className="h-[2px] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400" />
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.4em] text-fuchsia-300">
                  Workforce Operating System
                </div>
                <div className="mt-3 text-4xl font-black leading-none">
                  Welcome,
                  <br />
                  {staffName}
                </div>
                <div className="mt-3 max-w-[280px] text-sm leading-relaxed text-white/50">
                  Your personal operating system for shifts, salary, documents and team support.
                </div>
              </div>

              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white text-lg font-black text-black shadow-[0_0_35px_rgba(255,255,255,0.25)]">
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

            <div className="mt-6 grid grid-cols-3 gap-2">
              <StatusCard label="Status" value={loading ? "Loading" : shiftActive ? "On Shift" : shiftStatus} />
              <StatusCard label="Role" value={staff?.role || "Staff"} />
              <StatusCard label="Time" value={shiftDuration} />
            </div>

            <div className="mt-5 rounded-[30px] border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-cyan-300">
                    <Clock3 className="h-4 w-4" /> Next Shift
                  </div>
                  <div className="mt-3 text-2xl font-black">
                    {schedule
                      ? `${schedule.start_time} - ${schedule.end_time}`
                      : "No shift today"}
                  </div>
                  <div className="mt-1 text-sm text-white/45">
                    {schedule?.shift_type || "Open Schedule for upcoming shifts"}
                  </div>
                </div>
                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                  {shiftStatus}
                </div>
              </div>

              {!shiftActive && passkeyRequired ? (
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-violet-400/15 bg-violet-400/[0.06] px-3 py-2 text-xs text-violet-100/70">
                  <KeyRound className="h-4 w-4 shrink-0" />
                  {passkeyEnrolled
                    ? "Identity verification is required before clock-in."
                    : "Register a passkey in Profile before clock-in."}
                </div>
              ) : null}

              {!shiftActive && gpsRequired ? (
                <div className="mt-3 flex items-center gap-2 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] px-3 py-2 text-xs text-cyan-100/70">
                  <MapPin className="h-4 w-4 shrink-0" /> GPS location is required and verified when you start your shift.
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => runShiftAction(shiftActive ? "clock_out" : "clock_in")}
                disabled={loadingShift || loading || !staff}
                className={`mt-5 flex h-14 w-full items-center justify-center gap-3 rounded-[24px] text-sm font-black uppercase tracking-[0.2em] text-white disabled:opacity-40 ${
                  shiftActive
                    ? "bg-gradient-to-r from-red-500 to-orange-500"
                    : "bg-gradient-to-r from-emerald-500 to-cyan-500"
                }`}
              >
                {shiftActive ? <Square className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                {loadingShift
                  ? !shiftActive && passkeyRequired
                    ? "Verifying identity..."
                    : gpsRequired && !shiftActive
                      ? "Verifying location..."
                      : "Syncing..."
                  : shiftActive
                    ? "End Shift"
                    : "Start Shift"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="group rounded-[30px] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-3xl transition hover:border-violet-400/40 hover:bg-violet-500/10"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-violet-500/20 bg-violet-500/10 text-violet-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/30" />
                </div>
                <div className="mt-4 text-lg font-black">{card.title}</div>
                <div className="mt-1 text-sm text-white/45">{card.subtitle}</div>
              </Link>
            );
          })}
        </section>

        <section className="overflow-hidden rounded-[38px] border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/15 via-white/[0.04] to-cyan-500/10 shadow-[0_0_70px_rgba(217,70,239,0.15)] backdrop-blur-3xl">
          <div className="p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-gradient-to-br from-fuchsia-500 to-cyan-400 shadow-[0_0_40px_rgba(217,70,239,0.35)]">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-fuchsia-300">
                  <Sparkles className="h-4 w-4" /> Portal AI
                </div>
                <div className="mt-2 text-2xl font-black">Ask anything</div>
                <div className="mt-1 text-sm text-white/45">
                  Schedule, salary, documents, policy and team support.
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusCard({ label, value }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-black/30 p-3">
      <div className="text-[9px] uppercase tracking-[0.25em] text-white/35">{label}</div>
      <div className="mt-2 truncate text-sm font-black text-white">{value}</div>
    </div>
  );
}
