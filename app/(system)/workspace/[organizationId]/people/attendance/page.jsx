"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  History,
  RefreshCw,
  ShieldCheck,
  UserX,
  XCircle,
} from "lucide-react";

const ATTENDANCE_CLASSIFICATIONS = [
  "ABSENT",
  "APPROVED_LEAVE",
  "SICK_LEAVE",
  "PUBLIC_HOLIDAY",
  "TRAINING",
];

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function validMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
}

function validStaffId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function requestedMonth() {
  if (typeof window === "undefined") return currentMonth();

  const value = new URLSearchParams(window.location.search).get("month");
  return validMonth(value) ? value : currentMonth();
}

function requestedStaffId() {
  if (typeof window === "undefined") return "";

  const value = new URLSearchParams(window.location.search).get("staffId");
  return validStaffId(value) ? String(value).trim() : "";
}

function syncMonthQuery(month) {
  if (typeof window === "undefined" || !validMonth(month)) return;

  const url = new URL(window.location.href);
  url.searchParams.set("month", month);
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
}

function organizationQuery(organizationId) {
  return organizationId
    ? `&organizationId=${encodeURIComponent(organizationId)}`
    : "";
}

function payrollGovernanceHref(organizationId, month, staffId) {
  const base = `/workspace/${encodeURIComponent(organizationId)}/people/payroll/governance`;
  const query = new URLSearchParams();

  if (validMonth(month)) query.set("month", month);
  if (validStaffId(staffId)) query.set("staffId", staffId);

  const suffix = query.toString();
  return suffix ? `${base}?${suffix}` : base;
}

function humanizeClassification(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function organizationLocalInput(value, timeZone) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";

  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export default function AttendanceManagementPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "").trim();
  const [month, setMonth] = useState(currentMonth());
  const [focusStaffId, setFocusStaffId] = useState("");
  const [monthReady, setMonthReady] = useState(false);
  const [data, setData] = useState({
    shifts: [],
    attendance: [],
    attendanceCorrections: [],
    correctableShifts: [],
    pendingShifts: [],
    lateShifts: [],
    absenceCandidates: [],
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const initialMonth = requestedMonth();
    setMonth(initialMonth);
    setFocusStaffId(requestedStaffId());
    syncMonthQuery(initialMonth);
    setMonthReady(true);
  }, []);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/people/workforce/attendance?month=${month}${organizationQuery(organizationId)}`,
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
    if (!monthReady) return;
    load();
  }, [monthReady, month, organizationId]);

  const summary = useMemo(
    () => ({
      shifts: data.shifts?.length || 0,
      pending: data.pendingShifts?.length || 0,
      late: data.lateShifts?.length || 0,
      corrections: data.attendanceCorrections?.length || 0,
      absences: data.absenceCandidates?.length || 0,
    }),
    [data]
  );

  const focusScheduleId = useMemo(() => {
    if (!focusStaffId) return "";

    return String(
      (data.absenceCandidates || []).find(
        (schedule) => String(schedule?.staff_id || "") === focusStaffId
      )?.id || ""
    );
  }, [data.absenceCandidates, focusStaffId]);

  useEffect(() => {
    if (loading || !focusScheduleId) return;

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`attendance-focus-${focusScheduleId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [loading, focusScheduleId]);

  function changeMonth(value) {
    if (!validMonth(value)) return;
    setMonth(value);
    syncMonthQuery(value);
  }

  async function patch(action, body, successMessage) {
    const id = body.shiftId || body.scheduleId || action;
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch("/api/people/workforce/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...body,
          ...(organizationId ? { organizationId } : {}),
        }),
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

  async function correctShiftTime(shift) {
    const timezone = data.timezone || "UTC";
    const correctedClockInLocal = window.prompt(
      `Correct effective clock-in (${timezone})\nUse YYYY-MM-DDTHH:MM`,
      organizationLocalInput(shift.clock_in, timezone)
    );
    if (correctedClockInLocal === null) return;

    const correctedClockOutLocal = window.prompt(
      `Correct effective clock-out (${timezone})\nUse YYYY-MM-DDTHH:MM`,
      organizationLocalInput(shift.clock_out, timezone)
    );
    if (correctedClockOutLocal === null) return;

    const reason = window.prompt(
      "Manager correction reason / evidence (required):",
      ""
    );
    if (!reason || reason.trim().length < 3) {
      setMessage("A correction reason of at least 3 characters is required.");
      return;
    }

    await patch(
      "correct_shift_time",
      {
        shiftId: shift.id,
        correctedClockInLocal: correctedClockInLocal.trim(),
        correctedClockOutLocal: correctedClockOutLocal.trim(),
        reason: reason.trim(),
      },
      "Attendance correction recorded. Raw clock evidence was preserved and payroll will use the approved effective time."
    );
  }

  async function classifyAttendance(schedule) {
    const requested = window.prompt(
      `Classify this completed schedule:\n${ATTENDANCE_CLASSIFICATIONS.join("\n")}`,
      "ABSENT"
    );
    if (requested === null) return;

    const classification = String(requested || "").trim().toUpperCase();
    if (!ATTENDANCE_CLASSIFICATIONS.includes(classification)) {
      setMessage(
        `Classification must be one of: ${ATTENDANCE_CLASSIFICATIONS.join(", ")}.`
      );
      return;
    }

    const notes = window.prompt(
      `Manager evidence / note for ${humanizeClassification(classification)}:`,
      ""
    );
    if (!notes || notes.trim().length < 3) {
      setMessage("A manager note of at least 3 characters is required.");
      return;
    }

    setBusyId(schedule.id);
    setMessage("");
    try {
      const response = await fetch(
        "/api/people/workforce/attendance-classification",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduleId: schedule.id,
            classification,
            notes: notes.trim(),
            ...(organizationId ? { organizationId } : {}),
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to classify attendance");
      }
      setMessage(`${humanizeClassification(classification)} recorded for payroll review.`);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyId("");
    }
  }

  async function reclassifyAttendance(row) {
    const current = String(row.attendance_status || "ABSENT").toUpperCase();
    if (!ATTENDANCE_CLASSIFICATIONS.includes(current)) return;

    const requested = window.prompt(
      `Reclassify attendance. Current: ${current}\n${ATTENDANCE_CLASSIFICATIONS.join("\n")}`,
      current
    );
    if (requested === null) return;

    const classification = String(requested || "").trim().toUpperCase();
    if (!ATTENDANCE_CLASSIFICATIONS.includes(classification)) {
      setMessage(
        `Classification must be one of: ${ATTENDANCE_CLASSIFICATIONS.join(", ")}.`
      );
      return;
    }

    const notes = window.prompt("Reason / evidence for reclassification:", "");
    if (!notes || notes.trim().length < 3) {
      setMessage("A manager note of at least 3 characters is required.");
      return;
    }

    setBusyId(row.id);
    setMessage("");
    try {
      const response = await fetch(
        "/api/people/workforce/attendance-classification",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attendanceId: row.id,
            classification,
            notes: notes.trim(),
            ...(organizationId ? { organizationId } : {}),
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to reclassify attendance");
      }
      setMessage(`${humanizeClassification(classification)} saved.`);
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
              Review work evidence before payroll. Raw clock-in and clock-out records are immutable.
              Manager time corrections are appended as approved evidence with a reason, actor and timestamp;
              payroll uses the latest approved effective time without rewriting the original clock record.
            </p>
            {data.organizationId ? (
              <p className="mt-2 text-xs text-zinc-600">
                Organization scope: {data.organizationId} · {data.timezone || "UTC"}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {focusStaffId && organizationId ? (
              <Link
                href={payrollGovernanceHref(organizationId, month, focusStaffId)}
                className="flex h-11 items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.08] px-4 text-xs font-black uppercase tracking-[0.12em] text-cyan-200"
              >
                <ShieldCheck size={16} /> Return to Payroll Governance
              </Link>
            ) : null}
            <Link
              href={`/workspace/${organizationId}/people/attendance/clock-in-exceptions`}
              className="flex h-11 items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.08] px-4 text-xs font-black uppercase tracking-[0.12em] text-amber-200"
            >
              <AlertTriangle size={16} /> Clock-in exceptions
            </Link>
            <input
              type="month"
              value={month}
              onChange={(event) => changeMonth(event.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm"
            />
            <button
              onClick={load}
              disabled={!monthReady || loading}
              className="rounded-xl border border-white/10 bg-white/5 p-3 disabled:opacity-40"
              aria-label="Refresh"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {focusStaffId ? (
          <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.07] px-4 py-3 text-sm text-cyan-100/80">
            Payroll resolution focus is active for this employee and {month}. Matching unworked published shifts are highlighted below.
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric icon={<Clock3 size={18} />} label="Shift evidence" value={summary.shifts} />
          <Metric icon={<ShieldCheck size={18} />} label="Pending review" value={summary.pending} />
          <Metric icon={<AlertTriangle size={18} />} label="Effective late" value={summary.late} />
          <Metric icon={<History size={18} />} label="Corrections" value={summary.corrections} />
          <Metric icon={<UserX size={18} />} label="Needs classification" value={summary.absences} />
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
                <div>{formatDateTime(shift.raw_clock_in || shift.clock_in, data.timezone)}</div>
                <div className="text-zinc-500">{shift.raw_clock_out || shift.clock_out ? formatDateTime(shift.raw_clock_out || shift.clock_out, data.timezone) : "Open shift"}</div>
              </div>
              <div className="text-sm text-zinc-400">
                {Number(shift.raw_worked_minutes ?? shift.worked_minutes ?? 0)} worked min · {Number(shift.raw_overtime_minutes ?? shift.overtime_minutes ?? 0)} OT min
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
          title="Worked Shift Corrections"
          eyebrow="Immutable raw evidence · approved effective time"
          empty="No completed approved shifts are available for correction this month."
          loading={loading}
        >
          {(data.correctableShifts || []).map((shift) => {
            const corrected = Boolean(shift.attendance_correction_id);
            return (
              <div key={shift.id} className="grid gap-4 border-t border-white/5 px-5 py-4 lg:grid-cols-[1.25fr_1.35fr_1.35fr_auto] lg:items-center">
                <div>
                  <div className="font-bold">{shift.staff_name}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <span className="text-zinc-500">{shift.shift_source || "SCHEDULED"}</span>
                    {corrected ? (
                      <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-cyan-200">
                        Correction #{shift.attendance_correction_no}
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-zinc-500">Raw evidence</span>
                    )}
                  </div>
                </div>
                <div className="text-sm">
                  <div className="text-xs uppercase tracking-wider text-zinc-600">Raw clock</div>
                  <div className="mt-1 text-zinc-400">
                    {formatDateTime(shift.raw_clock_in || shift.clock_in, data.timezone)}
                  </div>
                  <div className="text-zinc-600">
                    → {formatDateTime(shift.raw_clock_out || shift.clock_out, data.timezone)}
                  </div>
                </div>
                <div className="text-sm">
                  <div className="text-xs uppercase tracking-wider text-zinc-600">Effective for payroll</div>
                  <div className={corrected ? "mt-1 text-cyan-200" : "mt-1 text-zinc-300"}>
                    {formatDateTime(shift.clock_in, data.timezone)}
                  </div>
                  <div className={corrected ? "text-cyan-300/70" : "text-zinc-500"}>
                    → {formatDateTime(shift.clock_out, data.timezone)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {Number(shift.worked_minutes || 0)} worked · {Number(shift.overtime_minutes || 0)} OT · {Number(shift.late_minutes || 0)} late min
                  </div>
                  {corrected ? (
                    <div className="mt-2 text-xs text-zinc-500">
                      {shift.attendance_correction_reason} · {shift.attendance_corrected_by || "Manager"} · {formatDateTime(shift.attendance_corrected_at, data.timezone)}
                    </div>
                  ) : null}
                </div>
                <button disabled={busyId === shift.id} onClick={() => correctShiftTime(shift)} className="action">
                  <History size={15} /> {corrected ? "Correct again" : "Correct time"}
                </button>
              </div>
            );
          })}
        </WorkspaceSection>

        <WorkspaceSection
          title="Unworked Published Shifts"
          eyebrow="Attendance classification"
          empty="No completed published shifts are missing attendance evidence."
          loading={loading}
        >
          {(data.absenceCandidates || []).map((schedule) => {
            const focused =
              focusStaffId && String(schedule?.staff_id || "") === focusStaffId;

            return (
              <div
                key={schedule.id}
                id={focused ? `attendance-focus-${schedule.id}` : undefined}
                className={`grid gap-4 border-t px-5 py-4 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center ${
                  focused
                    ? "border-cyan-300/30 bg-cyan-300/[0.08] ring-1 ring-inset ring-cyan-300/20"
                    : "border-white/5"
                }`}
              >
                <div>
                  <div className="font-bold">{schedule.staff_name}</div>
                  <div className="text-xs text-zinc-500">{schedule.department || schedule.role || "Workforce"}</div>
                </div>
                <div className="text-sm text-zinc-300">{schedule.shift_date}</div>
                <div className="text-sm text-zinc-400">{schedule.start_time} - {schedule.end_time}</div>
                <button disabled={busyId === schedule.id} onClick={() => classifyAttendance(schedule)} className="action action-bad">
                  <UserX size={16} /> Classify
                </button>
              </div>
            );
          })}
        </WorkspaceSection>

        <WorkspaceSection
          title="Attendance Ledger"
          eyebrow="Approved evidence"
          empty="No attendance rows for this month."
          loading={loading}
        >
          {(data.attendance || []).map((row) => {
            const classification = String(row.attendance_status || "").toUpperCase();
            const canReclassify =
              ATTENDANCE_CLASSIFICATIONS.includes(classification) &&
              !row.shift_id &&
              !row.actual_start &&
              !row.actual_end;
            const focused =
              focusStaffId && String(row?.staff_id || "") === focusStaffId;

            return (
              <div
                key={row.id}
                className={`grid gap-4 border-t px-5 py-4 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center ${
                  focused ? "border-cyan-300/20 bg-cyan-300/[0.04]" : "border-white/5"
                }`}
              >
                <div>
                  <div className="font-bold">{row.staff_name}</div>
                  <div className="text-xs text-zinc-500">{row.shift_date}</div>
                </div>
                <div className="text-sm text-zinc-300">
                  {humanizeClassification(classification || "PRESENT")}
                </div>
                <div className="text-sm text-zinc-500">
                  {row.approved_at ? `Reviewed ${formatDateTime(row.approved_at, data.timezone)}` : "Raw attendance record"}
                </div>
                {canReclassify ? (
                  <button
                    disabled={busyId === row.id}
                    onClick={() => reclassifyAttendance(row)}
                    className="action"
                  >
                    Reclassify
                  </button>
                ) : (
                  <div className="text-xs text-zinc-600">
                    {Number(row.late_minutes || 0)} raw late min
                  </div>
                )}
              </div>
            );
          })}
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

function formatDateTime(value, timeZone) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    timeZone: timeZone || undefined,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
