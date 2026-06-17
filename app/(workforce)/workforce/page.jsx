"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  FileText,
  Wallet,
  Users,
  Bot,
  Clock3,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  Play,
  Square,
} from "lucide-react";

import { supabase } from "@/lib/shared/supabase/client";
import WorkforceActivityFeed from "@/components/workforce/WorkforceActivityFeed";

export default function PortalHomePage() {
  const [staff, setStaff] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [loadingShift, setLoadingShift] = useState(false);

  async function loadPortal() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.email) return;

    const response = await fetch(
      `/api/staff/runtime?email=${session.user.email}`
    );

    const data = await response.json();

    if (data.success) {
      setStaff(data.staff);
      setRuntime(data);
    }
  }

  useEffect(() => {
    loadPortal();
  }, []);

  async function startShift() {
    if (!staff) return;

    setLoadingShift(true);

    await fetch("/api/staff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "clock_in",
        staffId: staff.id,
        staffName: staff.name,
        staffRole: staff.role,
        tenantId: staff.tenant_id,
      }),
    });

    await loadPortal();
    setLoadingShift(false);
  }

  async function endShift() {
    if (!staff) return;

    setLoadingShift(true);

    await fetch("/api/staff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "clock_out",
        staffId: staff.id,
        staffName: staff.name,
        staffRole: staff.role,
        tenantId: staff.tenant_id,
      }),
    });

    await loadPortal();
    setLoadingShift(false);
  }

  const cards = [
    {
      title: "Schedule",
      subtitle: "Next shift and monthly plan",
      href: "/workforce/schedule",
      icon: CalendarDays,
      accent: "from-cyan-500/20 to-blue-500/10",
    },
    {
      title: "Documents",
      subtitle: "Payslips, contracts and HR files",
      href: "/workforce/documents",
      icon: FileText,
      accent: "from-violet-500/20 to-fuchsia-500/10",
    },
    {
      title: "Payroll",
      subtitle: "Salary, service charge and history",
      href: "/workforce/payroll",
      icon: Wallet,
      accent: "from-emerald-500/20 to-cyan-500/10",
    },
    {
      title: "Tasks",
      subtitle: "Assigned work and approvals",
      href: "/workforce/tasks",
      icon: Users,
      accent: "from-orange-500/20 to-fuchsia-500/10",
    },
    {
      title: "Training",
      subtitle: "Courses and certifications",
      href: "/workforce/training",
      icon: ShieldCheck,
      accent: "from-violet-500/20 to-cyan-500/10",
    },
    {
      title: "Profile",
      subtitle: "Employment and personal details",
      href: "/workforce/profile",
      icon: FileText,
      accent: "from-fuchsia-500/20 to-cyan-500/10",
    },
  ];

  const staffName = staff?.name || "Team Member";
  const staffInitial = staffName?.[0] || "?";
  const shiftActive = runtime?.shiftActive;
  const shiftDuration = runtime?.shiftDuration || "00:00";
  const shiftStatus = runtime?.shiftStatus || "NO_SHIFT";
  const schedule = runtime?.schedule;

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
                  Good evening,
                  <br />
                  {staffName}
                </div>

                <div className="mt-3 max-w-[280px] text-sm leading-relaxed text-white/50">
                  Your personal operating system for shifts, salary, documents,
                  team updates and AI help.
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

            <div className="mt-6 grid grid-cols-3 gap-2">
              <div className="rounded-[22px] border border-white/10 bg-black/30 p-3">
                <div className="text-[9px] uppercase tracking-[0.25em] text-white/35">
                  Status
                </div>
                <div className="mt-2 text-sm font-black text-emerald-300">
                  {shiftActive ? "On Shift" : shiftStatus}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-black/30 p-3">
                <div className="text-[9px] uppercase tracking-[0.25em] text-white/35">
                  Role
                </div>
                <div className="mt-2 truncate text-sm font-black text-cyan-300">
                  {staff?.role || "Staff"}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-black/30 p-3">
                <div className="text-[9px] uppercase tracking-[0.25em] text-white/35">
                  Time
                </div>
                <div className="mt-2 text-sm font-black text-fuchsia-300">
                  {shiftDuration}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[30px] border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-cyan-300">
                    <Clock3 className="h-4 w-4" />
                    Next Shift
                  </div>

                  <div className="mt-3 text-2xl font-black">
                    {schedule
                      ? `${schedule.start_time} - ${schedule.end_time}`
                      : "No shift today"}
                  </div>

                  <div className="mt-1 text-sm text-white/45">
                    {schedule?.shift_type || "Check schedule for upcoming shifts"}
                  </div>
                </div>

                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                  {shiftStatus}
                </div>
              </div>

              <button
                onClick={shiftActive ? endShift : startShift}
                disabled={loadingShift || !staff}
                className={`mt-5 flex h-14 w-full items-center justify-center gap-3 rounded-[24px] text-sm font-black uppercase tracking-[0.2em] text-white ${
                  shiftActive
                    ? "bg-gradient-to-r from-red-500 to-orange-500"
                    : "bg-gradient-to-r from-emerald-500 to-cyan-500"
                }`}
              >
                {shiftActive ? (
                  <Square className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}

                {loadingShift
                  ? "Syncing..."
                  : shiftActive
                  ? "End Shift"
                  : "Start Shift"}
              </button>
            </div>
          </div>
        </section>


<section className="mt-4 overflow-hidden rounded-[34px] border border-violet-500/20 bg-violet-500/[0.06] backdrop-blur-2xl">

  <div className="p-5">

    <div className="text-[10px] uppercase tracking-[0.35em] text-violet-400">
      Workforce Intelligence
    </div>

    <div className="mt-3 text-2xl font-light text-white">
      Runtime Status
    </div>

    <div className="mt-4 space-y-2 text-sm text-white/70">

      <div>
        Status:
        <span className="ml-2 text-white">
          {runtime?.runtime?.shiftStatus || "OFF"}
        </span>
      </div>

      <div>
        Payroll:
        <span className="ml-2 text-white">
          {runtime?.runtime?.payrollStatus || "PENDING"}
        </span>
      </div>

      <div>
        Schedule:
        <span className="ml-2 text-white">
          {runtime?.runtime?.scheduleAssigned ? "ASSIGNED" : "NOT ASSIGNED"}
        </span>
      </div>

    </div>

    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/50">
      Workforce runtime active. Review schedule, payroll and documents.
    </div>

  </div>

</section>


        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.06] p-4 backdrop-blur-3xl">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/35">
              <Wallet className="h-4 w-4 text-emerald-300" />
              This Month
            </div>
            <div className="mt-4 text-3xl font-black">{shiftDuration}</div>
            <div className="mt-1 text-xs text-white/40">Current Shift</div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.06] p-4 backdrop-blur-3xl">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/35">
              <ShieldCheck className="h-4 w-4 text-fuchsia-300" />
              Payroll
            </div>
            <div className="mt-4 text-lg font-black">{runtime?.runtime?.payrollStatus || "PENDING"}</div>
            <div className="mt-1 text-xs text-white/40">Payroll Status</div>
          </div>
        </section>

        <section className="mt-4 overflow-hidden rounded-[34px] border border-cyan-500/20 bg-cyan-500/[0.06] backdrop-blur-2xl">

          <div className="p-5">

            <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-400">
              Workforce Status
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">

              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                  Status
                </div>

                <div className="mt-2 text-xl font-light text-white">
                  {runtime?.runtime?.shiftStatus || "OFF"}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                  Payroll
                </div>

                <div className="mt-2 text-xl font-light text-white">
                  {runtime?.runtime?.payrollStatus || "PENDING"}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                  Schedule
                </div>

                <div className="mt-2 text-xl font-light text-white">
                  {runtime?.runtime?.scheduleAssigned ? "ASSIGNED" : "NONE"}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                  Role
                </div>

                <div className="mt-2 text-xl font-light text-white">
                  {staff?.role || "--"}
                </div>
              </div>

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
                className="group flex items-center justify-between rounded-[30px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-2xl transition-all duration-300 hover:border-violet-400/40 hover:bg-violet-500/10"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-[22px] border border-violet-500/20 bg-violet-500/10 text-violet-300 transition-all duration-300 group-hover:border-violet-400/40 group-hover:bg-violet-500/20">
                    <Icon className="h-5 w-5" />
                  </div>

                  <div>
                    <div className="text-lg font-black">{card.title}</div>
                    <div className="mt-1 text-sm text-white/45">
                      {card.subtitle}
                    </div>
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 text-white/35" />
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
                  <Sparkles className="h-4 w-4" />
                  Portal AI
                </div>
                <div className="mt-2 text-2xl font-black">Ask anything</div>
                <div className="mt-1 text-sm text-white/45">
                  Schedule, salary, documents, policy and team support.
                </div>
              </div>
            </div>

            <Link
              href="/workforce/ai"
              className="mt-5 flex h-14 items-center justify-center rounded-[24px] bg-white text-sm font-black uppercase tracking-[0.2em] text-black"
            >
              Open AI Assistant
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
