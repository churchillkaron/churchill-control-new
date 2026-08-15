"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarDays, Plus, RefreshCw, Trash2 } from "lucide-react";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function WorkforceCalendarPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "").trim();
  const [month, setMonth] = useState(currentMonth());
  const [entityId, setEntityId] = useState("");
  const [entities, setEntities] = useState([]);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    calendarDate: "",
    dayType: "PUBLIC_HOLIDAY",
    name: "",
    notes: "",
    sourceReference: "",
  });

  async function load(nextEntityId = entityId) {
    if (!organizationId) return;
    setLoading(true);
    setMessage("");
    try {
      const query = new URLSearchParams({ organizationId, month });
      if (nextEntityId) query.set("entityId", nextEntityId);
      const response = await fetch(`/api/people/workforce/calendar?${query.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load workforce calendar");
      }
      setEntities(payload.entities || []);
      setDays(payload.days || []);
      if (!nextEntityId && payload.entity?.id) setEntityId(payload.entity.id);
    } catch (error) {
      setMessage(error?.message || "Unable to load workforce calendar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId, month]);

  useEffect(() => {
    if (entityId) load(entityId);
  }, [entityId]);

  async function addDay(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/people/workforce/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          entityId,
          ...form,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to add workforce calendar day");
      }
      setForm((current) => ({
        ...current,
        calendarDate: "",
        name: "",
        notes: "",
        sourceReference: "",
      }));
      setMessage("Workforce calendar day added.");
      await load(entityId);
    } catch (error) {
      setMessage(error?.message || "Unable to add workforce calendar day");
    } finally {
      setSaving(false);
    }
  }

  async function cancelDay(id) {
    if (!window.confirm("Cancel this workforce calendar day? Historical evidence will be preserved.")) return;
    const query = new URLSearchParams({ organizationId, entityId, id });
    const response = await fetch(`/api/people/workforce/calendar?${query.toString()}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      setMessage(payload?.error || "Unable to cancel workforce calendar day");
      return;
    }
    setMessage("Workforce calendar day cancelled.");
    await load(entityId);
  }

  const activeDays = useMemo(
    () => days.filter((row) => row.status === "ACTIVE"),
    [days]
  );
  const publicHolidays = activeDays.filter((row) => row.day_type === "PUBLIC_HOLIDAY");

  return (
    <main className="min-h-screen bg-[#030303] p-5 text-white lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#D6A66A]">
                People · Workforce
              </p>
              <h1 className="mt-2 text-4xl font-black">Workforce Calendar</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Maintain legal-entity calendar evidence for public holidays and organization-specific working-day exceptions. Calendar dates are configuration evidence; payroll treatment remains controlled by Payroll Policy.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={entityId}
                onChange={(event) => setEntityId(event.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm"
              >
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.display_name || entity.legal_name || entity.code}
                  </option>
                ))}
              </select>
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm"
              />
              <button
                type="button"
                onClick={() => load(entityId)}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-white/60"
                aria-label="Refresh calendar"
              >
                <RefreshCw size={18} />
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <Metric label="Active calendar days" value={activeDays.length} />
          <Metric label="Public holidays" value={publicHolidays.length} />
          <Metric label="Cancelled history" value={days.length - activeDays.length} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[400px_1fr]">
          <form onSubmit={addDay} className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[#D6A66A]" />
              <h2 className="text-xl font-black">Add Calendar Day</h2>
            </div>

            <Field label="Date">
              <input
                type="date"
                required
                value={form.calendarDate}
                onChange={(event) => setForm({ ...form, calendarDate: event.target.value })}
                className="input"
              />
            </Field>

            <Field label="Day type">
              <select
                value={form.dayType}
                onChange={(event) => setForm({ ...form, dayType: event.target.value })}
                className="input"
              >
                <option value="PUBLIC_HOLIDAY">Public holiday</option>
                <option value="ORGANIZATION_CLOSURE">Organization closure</option>
                <option value="WORKING_DAY_OVERRIDE">Working day override</option>
              </select>
            </Field>

            <Field label="Name">
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Calendar day name"
                className="input"
              />
            </Field>

            <Field label="Notes">
              <textarea
                rows={3}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Optional internal context"
                className="input resize-none"
              />
            </Field>

            <Field label="Source reference">
              <input
                value={form.sourceReference}
                onChange={(event) => setForm({ ...form, sourceReference: event.target.value })}
                placeholder="Optional authority/reference"
                className="input"
              />
            </Field>

            <button
              disabled={saving || !entityId || !form.calendarDate || !form.name.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-3 font-black text-black disabled:opacity-35"
            >
              <Plus size={18} /> {saving ? "Saving..." : "Add Calendar Day"}
            </button>
          </form>

          <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035]">
            <div className="border-b border-white/10 p-5">
              <h2 className="text-xl font-black">{month} Calendar Evidence</h2>
              <p className="mt-1 text-xs text-white/35">
                Cancelled records remain visible for audit history. Public holidays can later classify scheduled non-worked days for payroll according to policy.
              </p>
            </div>

            {message ? (
              <div className="mx-5 mt-5 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
                {message}
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-black/20 text-left text-[10px] uppercase tracking-[0.15em] text-white/35">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Source</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-white/35">Loading calendar...</td></tr>
                  ) : days.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-white/35">No workforce calendar days for this month.</td></tr>
                  ) : (
                    days.map((row) => (
                      <tr key={row.id} className="border-t border-white/5">
                        <td className="px-5 py-4 font-semibold">{row.calendar_date}</td>
                        <td className="px-5 py-4 text-white/55">{String(row.day_type || "").replaceAll("_", " ")}</td>
                        <td className="px-5 py-4">
                          <div className="font-semibold">{row.name}</div>
                          {row.notes ? <div className="mt-1 max-w-md text-xs text-white/30">{row.notes}</div> : null}
                        </td>
                        <td className="px-5 py-4 text-white/40">{row.source_reference || row.source_type}</td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${row.status === "ACTIVE" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.03] text-white/35"}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {row.status === "ACTIVE" ? (
                            <button
                              type="button"
                              onClick={() => cancelDay(row.id)}
                              className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-300"
                              title="Cancel calendar day"
                            >
                              <Trash2 size={15} />
                            </button>
                          ) : null}
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
      `}</style>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-4">
      <div className="text-[10px] uppercase tracking-[0.15em] text-white/30">{label}</div>
      <div className="mt-2 text-3xl font-black">{value}</div>
    </div>
  );
}
