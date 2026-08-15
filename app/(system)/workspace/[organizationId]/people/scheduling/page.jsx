"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CheckSquare2,
  Clock3,
  Lock,
  RefreshCw,
  Save,
  Trash2,
  Users,
} from "lucide-react";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(month) {
  const start = `${month}-01`;
  const end = new Date(`${start}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { start, end: end.toISOString().slice(0, 10) };
}

function datesForPlan({ startDate, endDate, weekdays }) {
  if (!startDate || !endDate || !weekdays.length || endDate < startDate) return [];

  const selected = new Set(weekdays);
  const dates = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    if (selected.has(cursor.getUTCDay())) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function memberLabel(member) {
  return `${member.name || member.email || "Staff"}${member.department ? ` · ${member.department}` : ""}`;
}

export default function SchedulePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const organizationId = String(
    params?.organizationId || searchParams.get("organizationId") || ""
  ).trim();
  const requestedMonth = searchParams.get("month");
  const initialMonth = /^\d{4}-\d{2}$/.test(String(requestedMonth || ""))
    ? requestedMonth
    : currentMonth();

  const [month, setMonth] = useState(initialMonth);
  const [staff, setStaff] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedStaffIds, setSelectedStaffIds] = useState([]);
  const [plan, setPlan] = useState(() => {
    const bounds = monthBounds(initialMonth);
    return {
      startDate: bounds.start,
      endDate: bounds.end,
      weekdays: [],
      startTime: "",
      endTime: "",
      shiftType: "",
      notes: "",
    };
  });

  async function load() {
    setLoading(true);
    setMessage("");

    try {
      const query = new URLSearchParams({ month });
      if (organizationId) query.set("organizationId", organizationId);

      const response = await fetch(
        `/api/people/workforce/schedules?${query.toString()}`,
        { cache: "no-store" }
      );
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to load schedules");
      }

      setStaff(payload.staff || []);
      setSchedules(payload.schedules || []);
      setSelectedStaffIds((current) =>
        current.filter((staffId) =>
          (payload.staff || []).some((member) => member.id === staffId)
        )
      );
    } catch (error) {
      setMessage(error?.message || "Unable to load schedules");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const bounds = monthBounds(month);
    setPlan((current) => ({
      ...current,
      startDate: bounds.start,
      endDate: bounds.end,
    }));
    load();
  }, [month, organizationId]);

  const scheduledStaffIds = useMemo(
    () => new Set(schedules.map((row) => row.staff_id)),
    [schedules]
  );

  const summary = useMemo(
    () => ({
      activeStaff: staff.length,
      scheduledStaff: scheduledStaffIds.size,
      shifts: schedules.length,
      unscheduledStaff: staff.filter(
        (member) => !scheduledStaffIds.has(member.id)
      ).length,
    }),
    [staff, schedules, scheduledStaffIds]
  );

  const shiftDates = useMemo(() => datesForPlan(plan), [plan]);
  const plannedRows = selectedStaffIds.length * shiftDates.length;

  function toggleStaff(staffId) {
    setSelectedStaffIds((current) =>
      current.includes(staffId)
        ? current.filter((id) => id !== staffId)
        : [...current, staffId]
    );
  }

  function selectUnscheduled() {
    setSelectedStaffIds(
      staff
        .filter((member) => !scheduledStaffIds.has(member.id))
        .map((member) => member.id)
    );
  }

  function toggleWeekday(day) {
    setPlan((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day)
        ? current.weekdays.filter((value) => value !== day)
        : [...current.weekdays, day].sort(),
    }));
  }

  async function publishSchedule(event) {
    event.preventDefault();
    setMessage("");

    if (!selectedStaffIds.length) {
      setMessage("Select at least one staff member.");
      return;
    }
    if (!shiftDates.length) {
      setMessage("Choose at least one weekday inside the selected date range.");
      return;
    }
    if (!plan.startTime || !plan.endTime) {
      setMessage("Enter the actual shift start and end times before publishing.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/people/workforce/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: organizationId || undefined,
          staffIds: selectedStaffIds,
          shiftDates,
          startTime: plan.startTime,
          endTime: plan.endTime,
          shiftType: plan.shiftType,
          notes: plan.notes,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to publish schedule");
      }

      setMessage(
        `${payload.publishedRows || 0} published schedule row${payload.publishedRows === 1 ? "" : "s"} saved for ${payload.staffCount || selectedStaffIds.length} staff member${(payload.staffCount || selectedStaffIds.length) === 1 ? "" : "s"}.`
      );
      await load();
    } catch (error) {
      setMessage(error?.message || "Unable to publish schedule");
    } finally {
      setSaving(false);
    }
  }

  async function removeSchedule(id) {
    if (!window.confirm("Cancel this published shift?")) return;

    const query = new URLSearchParams({ id });
    if (organizationId) query.set("organizationId", organizationId);

    const response = await fetch(
      `/api/people/workforce/schedules?${query.toString()}`,
      { method: "DELETE" }
    );
    const payload = await response.json();

    if (!response.ok || !payload.success) {
      setMessage(payload.error || "Unable to cancel schedule");
      return;
    }

    setMessage("Published shift cancelled.");
    await load();
  }

  return (
    <main className="min-h-screen bg-[#030303] p-5 text-white lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.045] backdrop-blur-3xl">
          <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A] to-transparent" />
          <div className="flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#D6A66A]">
                People · Workforce
              </p>
              <h1 className="mt-2 text-4xl font-black">Scheduling Management</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Publish real roster evidence for staff clock-in, attendance and payroll readiness. Shift times and working days are explicit manager inputs; once shift or attendance evidence exists, the roster row is locked and corrections move to Attendance Management.
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
                type="button"
                onClick={load}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
                aria-label="Refresh"
              >
                <RefreshCw size={18} />
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            icon={<Users size={18} />}
            label="Active staff"
            value={summary.activeStaff}
          />
          <Metric
            icon={<CalendarDays size={18} />}
            label="Scheduled staff"
            value={summary.scheduledStaff}
          />
          <Metric
            icon={<Clock3 size={18} />}
            label="Published shifts"
            value={summary.shifts}
          />
          <Metric
            icon={<Users size={18} />}
            label="Unscheduled staff"
            value={summary.unscheduledStaff}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[430px_1fr]">
          <form
            onSubmit={publishSchedule}
            className="space-y-5 rounded-[30px] border border-white/10 bg-white/[0.035] p-5"
          >
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
                Manager action
              </p>
              <h2 className="mt-1 text-2xl font-black">Publish Roster</h2>
              <p className="mt-2 text-xs leading-5 text-white/35">
                Select staff, a date range, working weekdays and actual shift times. Existing staff/date rows can be corrected only before workforce evidence exists; missing rows are created as PUBLISHED.
              </p>
            </div>

            <Field label="Staff">
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedStaffIds(staff.map((member) => member.id))
                    }
                    className="mini-button"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={selectUnscheduled}
                    className="mini-button"
                  >
                    Unscheduled
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStaffIds([])}
                    className="mini-button"
                  >
                    Clear
                  </button>
                </div>
                {staff.map((member) => (
                  <label
                    key={member.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.04]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStaffIds.includes(member.id)}
                      onChange={() => toggleStaff(member.id)}
                    />
                    <span className="text-sm text-white/70">
                      {memberLabel(member)}
                    </span>
                  </label>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <input
                  type="date"
                  value={plan.startDate}
                  onChange={(event) =>
                    setPlan({ ...plan, startDate: event.target.value })
                  }
                  required
                  className="input"
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  value={plan.endDate}
                  onChange={(event) =>
                    setPlan({ ...plan, endDate: event.target.value })
                  }
                  required
                  className="input"
                />
              </Field>
            </div>

            <Field label="Working weekdays">
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((day) => {
                  const active = plan.weekdays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleWeekday(day.value)}
                      className={`rounded-lg border px-1 py-2 text-[10px] font-bold ${
                        active
                          ? "border-[#D6A66A]/50 bg-[#D6A66A]/15 text-[#E7C797]"
                          : "border-white/10 bg-white/[0.03] text-white/35"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Start time">
                <input
                  type="time"
                  value={plan.startTime}
                  onChange={(event) =>
                    setPlan({ ...plan, startTime: event.target.value })
                  }
                  required
                  className="input"
                />
              </Field>
              <Field label="End time">
                <input
                  type="time"
                  value={plan.endTime}
                  onChange={(event) =>
                    setPlan({ ...plan, endTime: event.target.value })
                  }
                  required
                  className="input"
                />
              </Field>
            </div>

            <Field label="Shift type">
              <input
                value={plan.shiftType}
                onChange={(event) =>
                  setPlan({ ...plan, shiftType: event.target.value })
                }
                placeholder="Optional classification"
                className="input"
              />
            </Field>
            <Field label="Notes">
              <textarea
                value={plan.notes}
                onChange={(event) =>
                  setPlan({ ...plan, notes: event.target.value })
                }
                rows={3}
                placeholder="Optional"
                className="input resize-none"
              />
            </Field>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-white/45">
              <div className="flex items-center justify-between">
                <span>Selected staff</span>
                <strong className="text-white/80">{selectedStaffIds.length}</strong>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Selected dates</span>
                <strong className="text-white/80">{shiftDates.length}</strong>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Published rows</span>
                <strong className="text-[#D6A66A]">{plannedRows}</strong>
              </div>
            </div>

            <button
              disabled={
                saving ||
                !selectedStaffIds.length ||
                !shiftDates.length ||
                !plan.startTime ||
                !plan.endTime
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-3 font-black text-black disabled:opacity-35"
            >
              <Save size={18} /> {saving ? "Publishing..." : "Publish Schedule"}
            </button>

            {message ? (
              <p className="text-sm text-white/60">{message}</p>
            ) : null}
          </form>

          <section className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.035]">
            <div className="flex flex-col gap-2 border-b border-white/10 p-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
                  {month}
                </p>
                <h2 className="mt-1 text-2xl font-black">Published Roster</h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-white/35">
                <CheckSquare2 className="h-4 w-4" /> Only PUBLISHED rows count toward payroll readiness
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-black/20 text-left text-xs uppercase tracking-wider text-white/35">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Staff</th>
                    <th className="px-5 py-3">Department</th>
                    <th className="px-5 py-3">Shift</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-10 text-center text-white/35"
                      >
                        Loading schedules...
                      </td>
                    </tr>
                  ) : schedules.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-10 text-center text-white/35"
                      >
                        No published shifts for this month.
                      </td>
                    </tr>
                  ) : (
                    schedules.map((row) => (
                      <tr key={row.id} className="border-t border-white/5">
                        <td className="px-5 py-4 font-semibold">
                          {row.shift_date}
                        </td>
                        <td className="px-5 py-4">
                          {row.staff_name || "Staff"}
                        </td>
                        <td className="px-5 py-4 text-white/45">
                          {row.department || "-"}
                        </td>
                        <td className="px-5 py-4">
                          {row.start_time} - {row.end_time}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                              PUBLISHED
                            </span>
                            {row.evidenceLocked ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs text-amber-200"
                                title="Shift or attendance evidence exists. Correct the evidence in Attendance Management instead of rewriting the roster."
                              >
                                <Lock size={12} /> Evidence locked
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {row.evidenceLocked ? (
                            <span className="text-[11px] text-white/30">
                              Manage in Attendance
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => removeSchedule(row.id)}
                              className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-300"
                              aria-label="Cancel published shift"
                              title="Cancel published shift"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>

      <style jsx>{`
        .input { width: 100%; border-radius: .75rem; border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.22); padding: .75rem 1rem; color: white; outline: none; }
        .input:focus { border-color: rgba(214,166,106,.45); }
        .mini-button { border-radius: .65rem; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.04); padding: .4rem .65rem; font-size: .65rem; font-weight: 800; color: rgba(255,255,255,.55); text-transform: uppercase; letter-spacing: .08em; }
      `}</style>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
        {label}
      </span>
      {children}
    </label>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center gap-2 text-white/35">
        {icon}
        <span className="text-[10px] uppercase tracking-[0.16em]">{label}</span>
      </div>
      <div className="mt-3 text-3xl font-black">{value}</div>
    </div>
  );
}
