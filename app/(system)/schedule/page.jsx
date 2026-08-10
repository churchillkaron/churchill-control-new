"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, RefreshCw, Save, Trash2, Users } from "lucide-react";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function SchedulePage() {
  const [month, setMonth] = useState(currentMonth());
  const [staff, setStaff] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    staffId: "",
    shiftDate: today(),
    startTime: "09:00",
    endTime: "18:00",
    shiftType: "STANDARD",
    notes: "",
  });

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/people/workforce/schedules?month=${month}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load schedules");

      setStaff(payload.staff || []);
      setSchedules(payload.schedules || []);
      setForm((current) => ({
        ...current,
        staffId: current.staffId || payload.staff?.[0]?.id || "",
        shiftDate: current.shiftDate?.startsWith(month) ? current.shiftDate : `${month}-01`,
      }));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [month]);

  const summary = useMemo(() => {
    const scheduledStaff = new Set(schedules.map((row) => row.staff_id));
    return {
      activeStaff: staff.length,
      scheduledStaff: scheduledStaff.size,
      shifts: schedules.length,
      unscheduledStaff: Math.max(0, staff.length - scheduledStaff.size),
    };
  }, [staff, schedules]);

  async function saveSchedule(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/people/workforce/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to save schedule");
      setMessage("Published schedule saved.");
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeSchedule(id) {
    if (!window.confirm("Delete this published shift?")) return;

    const response = await fetch(`/api/people/workforce/schedules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setMessage(payload.error || "Unable to delete schedule");
      return;
    }

    await load();
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-5 text-white lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Workforce Operations</p>
            <h1 className="mt-2 text-4xl font-black">Scheduling Management</h1>
            <p className="mt-2 text-zinc-400">Published shifts feed staff clock-in, attendance and payroll readiness.</p>
          </div>
          <div className="flex items-center gap-3">
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm" />
            <button onClick={load} className="rounded-xl border border-white/10 bg-white/5 p-3" aria-label="Refresh"><RefreshCw size={18} /></button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={<Users size={18} />} label="Active staff" value={summary.activeStaff} />
          <Metric icon={<CalendarDays size={18} />} label="Scheduled staff" value={summary.scheduledStaff} />
          <Metric icon={<Clock3 size={18} />} label="Published shifts" value={summary.shifts} />
          <Metric icon={<Users size={18} />} label="Unscheduled staff" value={summary.unscheduledStaff} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
          <form onSubmit={saveSchedule} className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Manager action</p>
              <h2 className="mt-1 text-2xl font-black">Publish Shift</h2>
            </div>

            <Field label="Staff">
              <select value={form.staffId} onChange={(event) => setForm({ ...form, staffId: event.target.value })} required className="input">
                <option value="">Select staff</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>{member.name || member.email}{member.department ? ` - ${member.department}` : ""}</option>
                ))}
              </select>
            </Field>

            <Field label="Shift date"><input type="date" value={form.shiftDate} onChange={(event) => setForm({ ...form, shiftDate: event.target.value })} required className="input" /></Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Start"><input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} required className="input" /></Field>
              <Field label="End"><input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} required className="input" /></Field>
            </div>

            <Field label="Shift type"><input value={form.shiftType} onChange={(event) => setForm({ ...form, shiftType: event.target.value })} className="input" /></Field>
            <Field label="Notes"><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} className="input resize-none" /></Field>

            <button disabled={saving || !form.staffId} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-black text-black disabled:opacity-40">
              <Save size={18} /> {saving ? "Saving..." : "Save & Publish"}
            </button>

            {message && <p className="text-sm text-zinc-300">{message}</p>}
          </form>

          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">{month}</p>
              <h2 className="mt-1 text-2xl font-black">Published Roster</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-black/20 text-left text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-5 py-3">Date</th><th className="px-5 py-3">Staff</th><th className="px-5 py-3">Department</th><th className="px-5 py-3">Shift</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-zinc-500">Loading schedules...</td></tr>
                  ) : schedules.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-zinc-500">No published shifts for this month.</td></tr>
                  ) : schedules.map((row) => (
                    <tr key={row.id} className="border-t border-white/5">
                      <td className="px-5 py-4 font-semibold">{row.shift_date}</td>
                      <td className="px-5 py-4">{row.staff_name || "Staff"}</td>
                      <td className="px-5 py-4 text-zinc-400">{row.department || "-"}</td>
                      <td className="px-5 py-4">{row.start_time} - {row.end_time}</td>
                      <td className="px-5 py-4"><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">{row.status || "PUBLISHED"}</span></td>
                      <td className="px-5 py-4 text-right"><button onClick={() => removeSchedule(row.id)} className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-300" aria-label="Delete shift"><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>

      <style jsx>{`
        .input { width: 100%; border-radius: .75rem; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); padding: .75rem 1rem; color: white; outline: none; }
        .input:focus { border-color: rgba(255,255,255,.3); }
      `}</style>
    </main>
  );
}

function Field({ label, children }) {
  return <label className="block space-y-2"><span className="text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</span>{children}</label>;
}

function Metric({ icon, label, value }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-center gap-2 text-zinc-500">{icon}<span className="text-xs uppercase tracking-wider">{label}</span></div><div className="mt-3 text-3xl font-black">{value}</div></div>;
}
