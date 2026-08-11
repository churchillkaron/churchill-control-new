"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  UserX,
  XCircle,
} from "lucide-react";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function AttendanceManagementPage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState({
    shifts: [],
    attendance: [],
    pendingShifts: [],
    lateShifts: [],
    absenceCandidates: [],
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/people/workforce/attendance?month=${month}`,
        { cache: "no-store" }
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to load attendance");
      }
      setData(payload);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [month]);

  const summary = useMemo(
    () => ({
      shifts: data.shifts?.length || 0,
      pending: data.pendingShifts?.length || 0,
      late: data.lateShifts?.length || 0,
      absences: data.absenceCandidates?.length || 0,
    }),
    [data]
  );

  async function patch(action, body, successMessage) {
    const id = body.shiftId || body.scheduleId || action;
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch("/api/people/workforce/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to update attendance");
      }
      setMessage(successMessage);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyId("");
    }
  }

  async function reviewShift(shift, decision) {
    const notes = window.prompt(
      `${decision === "APPROVED" ? "Approval" : "Rejection"} note (optional):`,
      ""
    );
    if (notes === null) return;
    await patch(
      "review_shift",
      { shiftId: shift.id, decision, notes },
      `Shift ${decision.toLowerCase()}.`
    );
  }

  async function adjustLateness(shift) {
    const current = Number(shift.late_minutes || 0);
    const value = window.prompt("Correct late minutes:", String(current));
    if (value === null) return;
    const lateMinutes = Number(value);
    if (!Number.isInteger(lateMinutes) || lateMinutes < 0) {
      setMessage("Late minutes must be a non-negative whole number.");
      return;
    }
    const notes = window.prompt("Reason for lateness adjustment:", "");
    if (!notes) {
      setMessage("An adjustment reason is required.");
      return;
    }
    await patch(
      "adjust_lateness",
      { shiftId: shift.id, lateMinutes, notes },
      "Lateness adjusted and approved."
    );
  }

  async function markAbsent(schedule) {
    const notes = window.prompt("Reason / manager note for absence:", "");
    if (!notes) return;

    setBusyId(schedule.id);
    setMessage("");
    try {
      const response = await fetch("/api/people/workforce/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_absent",
          scheduleId: schedule.id,
          notes,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to record absence");
      }
      setMessage("Absence confirmed.");
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-5 text-white lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">
              People · Workforce
            </p>
            <h1 className="mt-2 text-4xl font-black">Attendance Management</h1>
            <p className="mt-2 max-w-3xl text-zinc-400">
              Review unscheduled work, lateness and missed published shifts before payroll.
              Raw clock-in and clock-out evidence remains unchanged.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm"
            />
            <button
              onClick={load}
              className="rounded-xl border border-white/10 bg-white/5 p-3"
              aria-label="Refresh"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={<Clock3 size={18} />} label="Shift evidence" value={summary.shifts} />
          <Metric icon={<ShieldCheck size={18} />} label="Pending review" value={summary.pending} />
          <Metric icon={<AlertTriangle size={18} />} label="Late shifts" value={summary.late} />
          <Metric icon={<UserX size={18} />} label="Absence candidates" value={summary.absences} />
        </section>

        {message && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">
            {message}
          </div>
        )}

        <WorkspaceSection
          title="Pending Shift Review"
          eyebrow="Unscheduled work"
          empty="No shifts are waiting for manager review."
          loading={loading}
        >
          {(data.pendingShifts || []).map((shift) => (
            <div key={shift.id} className="grid gap-4 border-t border-white/5 px-5 py-4 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center">
              <div>
                <div className="font-bold">{shift.staff_name}</div>
                <div className="text-xs text-zinc-500">{shift.shift_source || "UNSCHEDULED"}</div>
              </div>
              <div className="text-sm text-zinc-300">
                <div>{formatDateTime(shift.clock_in)}</div>
                <div className="text-zinc-500">{shift.clock_out ? formatDateTime(shift.clock_out) : "Open shift"}</div>
              </div>
              <div className="text-sm text-zinc-400">
                {Number(shift.worked_minutes || 0)} worked min · {Number(shift.overtime_minutes || 0)} OT min
              </div>
              <div className="flex gap-2">
                <button disabled={busyId === shift.id} onClick={() => reviewShift(shift, "APPROVED")} className="action action-ok">
                  <CheckCircle2 size={16} /> Approve
                </button>
                <button disabled={busyId === shift.id} onClick={() => reviewShift(shift, "REJECTED")} className="action action-bad">
                  <XCircle size={16} /> Reject
                </button>
              </div>
            </div>
          ))}
        </WorkspaceSection>

        <WorkspaceSection
          title="Lateness Review"
          eyebrow="Attendance exceptions"
          empty="No late shift evidence for this month."
          loading={loading}
        >
          {(data.lateShifts || []).map((shift) => (
            <div key={shift.id} className="grid gap-4 border-t border-white/5 px-5 py-4 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center">
              <div>
                <div className="font-bold">{shift.staff_name}</div>
                <div className="text-xs text-zinc-500">{shift.shift_source || "SCHEDULED"}</div>
              </div>
              <div className="text-sm text-zinc-300">{formatDateTime(shift.clock_in)}</div>
              <div className="text-sm">
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                  {Number(shift.late_minutes || 0)} late min
                </span>
              </div>
              <button disabled={busyId === shift.id} onClick={() => adjustLateness(shift)} className="action">
                Adjust
              </button>
            </div>
          ))}
        </WorkspaceSection>

        <WorkspaceSection
          title="Missed Published Shifts"
          eyebrow="Absence reconciliation"
          empty="No completed published shifts are missing attendance evidence."
          loading={loading}
        >
          {(data.absenceCandidates || []).map((schedule) => (
            <div key={schedule.id} className="grid gap-4 border-t border-white/5 px-5 py-4 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center">
              <div>
                <div className="font-bold">{schedule.staff_name}</div>
                <div className="text-xs text-zinc-500">{schedule.department || schedule.role || "Workforce"}</div>
              </div>
              <div className="text-sm text-zinc-300">{schedule.shift_date}</div>
              <div className="text-sm text-zinc-400">{schedule.start_time} - {schedule.end_time}</div>
              <button disabled={busyId === schedule.id} onClick={() => markAbsent(schedule)} className="action action-bad">
                <UserX size={16} /> Confirm absence
              </button>
            </div>
          ))}
        </WorkspaceSection>

        <WorkspaceSection
          title="Attendance Ledger"
          eyebrow="Approved evidence"
          empty="No attendance rows for this month."
          loading={loading}
        >
          {(data.attendance || []).map((row) => (
            <div key={row.id} className="grid gap-4 border-t border-white/5 px-5 py-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:items-center">
              <div>
                <div className="font-bold">{row.staff_name}</div>
                <div className="text-xs text-zinc-500">{row.shift_date}</div>
              </div>
              <div className="text-sm text-zinc-300">{row.attendance_status || "PRESENT"}</div>
              <div className="text-sm text-zinc-400">{Number(row.late_minutes || 0)} late min</div>
              <div className="text-sm text-zinc-500">{row.approved_at ? `Reviewed ${formatDateTime(row.approved_at)}` : "Not reviewed"}</div>
            </div>
          ))}
        </WorkspaceSection>
      </div>

      <style jsx>{`
        .action { display: inline-flex; align-items: center; justify-content: center; gap: .4rem; border-radius: .7rem; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); padding: .55rem .8rem; font-size: .8rem; font-weight: 800; }
        .action:disabled { opacity: .4; }
        .action-ok { border-color: rgba(16,185,129,.25); background: rgba(16,185,129,.1); color: rgb(110,231,183); }
        .action-bad { border-color: rgba(239,68,68,.25); background: rgba(239,68,68,.1); color: rgb(252,165,165); }
      `}</style>
    </main>
  );
}

function WorkspaceSection({ title, eyebrow, empty, loading, children }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
      <div className="p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-black">{title}</h2>
      </div>
      {loading ? (
        <div className="border-t border-white/5 px-5 py-10 text-center text-zinc-500">Loading...</div>
      ) : rows.length ? (
        rows
      ) : (
        <div className="border-t border-white/5 px-5 py-10 text-center text-zinc-500">{empty}</div>
      )}
    </section>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center gap-2 text-zinc-500">
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-3 text-3xl font-black">{value}</div>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
