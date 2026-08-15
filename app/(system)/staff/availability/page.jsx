"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Clock3, RefreshCw, Save, Trash2 } from "lucide-react";

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

function emptyRules() {
  return DAYS.map((day) => ({
    weekday: day.value,
    label: day.label,
    mode: "UNSPECIFIED",
    startTime: "",
    endTime: "",
    notes: "",
  }));
}

function displayType(value) {
  return String(value || "").toUpperCase() === "UNAVAILABLE" ? "Unavailable" : "Available";
}

export default function StaffAvailabilityPage() {
  const [data, setData] = useState({ patterns: [], exceptions: [], upcomingSchedules: [], today: "", timezone: "UTC" });
  const [rules, setRules] = useState(emptyRules);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [exception, setException] = useState({ exceptionDate: "", availabilityType: "UNAVAILABLE", startTime: "", endTime: "", notes: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/staff/availability", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load availability");
      setData(payload);
      setEffectiveFrom((current) => current || payload.today || "");
      setException((current) => ({ ...current, exceptionDate: current.exceptionDate || payload.today || "" }));

      const active = (payload.patterns || []).filter((row) => row.status === "ACTIVE" && (!row.effective_to || row.effective_to >= (payload.today || "")));
      const newestStart = active.reduce((latest, row) => row.effective_from > latest ? row.effective_from : latest, "");
      const newest = newestStart ? active.filter((row) => row.effective_from === newestStart) : [];
      setRules(DAYS.map((day) => {
        const row = newest.find((item) => Number(item.weekday) === day.value);
        return {
          weekday: day.value,
          label: day.label,
          mode: row?.availability_type || "UNSPECIFIED",
          startTime: row?.start_time || "",
          endTime: row?.end_time || "",
          notes: row?.notes || "",
        };
      }));
    } catch (error) {
      setMessage(error?.message || "Unable to load availability");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const conflicts = useMemo(
    () => (data.upcomingSchedules || []).filter((row) => row?.availability?.conflict && !row?.availability_override_reason),
    [data.upcomingSchedules]
  );

  function updateRule(weekday, patch) {
    setRules((current) => current.map((row) => row.weekday === weekday ? { ...row, ...patch } : row));
  }

  async function savePattern(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const normalized = rules.filter((row) => row.mode !== "UNSPECIFIED").map((row) => ({
        weekday: row.weekday,
        availabilityType: row.mode,
        startTime: row.startTime || null,
        endTime: row.endTime || null,
        notes: row.notes || null,
      }));
      const response = await fetch("/api/staff/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "replace_pattern", effectiveFrom, rules: normalized }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to save weekly availability");
      setMessage("Weekly availability saved. Existing roster rows are preserved and any new conflicts are shown to managers.");
      await load();
    } catch (error) {
      setMessage(error?.message || "Unable to save weekly availability");
    } finally {
      setSaving(false);
    }
  }

  async function addException(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/staff/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_exception", ...exception }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to save availability exception");
      setException((current) => ({ ...current, startTime: "", endTime: "", notes: "" }));
      setMessage("Date-specific availability saved.");
      await load();
    } catch (error) {
      setMessage(error?.message || "Unable to save availability exception");
    } finally {
      setSaving(false);
    }
  }

  async function cancelException(exceptionId) {
    if (!window.confirm("Cancel this availability exception?")) return;
    const response = await fetch("/api/staff/availability", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel_exception", exceptionId }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      setMessage(payload?.error || "Unable to cancel availability exception");
      return;
    }
    setMessage("Availability exception cancelled.");
    await load();
  }

  return (
    <main className="min-h-screen bg-[#030303] p-5 text-white lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#D6A66A]">Staff · Workforce</p>
              <h1 className="mt-2 text-4xl font-black">My Availability</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
                Tell scheduling when you are normally available and add date-specific exceptions. Availability guides roster planning; formal leave or sickness must still be submitted through Requests.
              </p>
            </div>
            <button type="button" onClick={load} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-white/60">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </header>

        {message ? <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/65">{message}</div> : null}

        {conflicts.length ? (
          <section className="rounded-[26px] border border-amber-400/25 bg-amber-400/[0.08] p-5">
            <div className="flex items-center gap-2 text-amber-100"><AlertTriangle className="h-5 w-5" /><h2 className="font-black">Existing roster conflicts</h2></div>
            <p className="mt-2 text-xs text-amber-100/60">Your availability changed after these shifts were published. The roster is preserved; speak with your manager or use Requests if you need formal time off.</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {conflicts.slice(0, 8).map((row) => (
                <div key={row.id} className="rounded-xl border border-amber-300/15 bg-black/20 px-3 py-3 text-xs">
                  <div className="font-black text-white/80">{row.shift_date} · {row.start_time}-{row.end_time}</div>
                  <div className="mt-1 text-amber-100/60">{row.availability.reason}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
          <form onSubmit={savePattern} className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[#D6A66A]"><CalendarDays className="h-5 w-5" /><h2 className="text-2xl font-black text-white">Weekly Pattern</h2></div>
                <p className="mt-2 text-xs text-white/35">Unspecified days remain flexible. A start/end window means a shift should fit fully inside that window.</p>
              </div>
              <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Effective from
                <input type="date" value={effectiveFrom} min={data.today || undefined} onChange={(event) => setEffectiveFrom(event.target.value)} className="mt-2 block rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" required />
              </label>
            </div>

            <div className="mt-5 space-y-2">
              {rules.map((row) => (
                <div key={row.weekday} className="grid gap-2 rounded-2xl border border-white/[0.07] bg-black/20 p-3 md:grid-cols-[120px_160px_1fr_1fr] md:items-center">
                  <div className="text-sm font-black text-white/70">{row.label}</div>
                  <select value={row.mode} onChange={(event) => updateRule(row.weekday, { mode: event.target.value })} className="input">
                    <option value="UNSPECIFIED">Unspecified</option>
                    <option value="AVAILABLE">Available</option>
                    <option value="UNAVAILABLE">Unavailable</option>
                  </select>
                  <input type="time" disabled={row.mode === "UNSPECIFIED"} value={row.startTime} onChange={(event) => updateRule(row.weekday, { startTime: event.target.value })} className="input disabled:opacity-30" aria-label={`${row.label} start`} />
                  <input type="time" disabled={row.mode === "UNSPECIFIED"} value={row.endTime} onChange={(event) => updateRule(row.weekday, { endTime: event.target.value })} className="input disabled:opacity-30" aria-label={`${row.label} end`} />
                </div>
              ))}
            </div>

            <button disabled={saving || !effectiveFrom} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-3 font-black text-black disabled:opacity-40"><Save className="h-4 w-4" /> Save Weekly Availability</button>
          </form>

          <div className="space-y-6">
            <form onSubmit={addException} className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5">
              <div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-[#D6A66A]" /><h2 className="text-2xl font-black">Date Exception</h2></div>
              <p className="mt-2 text-xs text-white/35">Use this for a one-day availability change. It does not create approved leave.</p>
              <div className="mt-5 space-y-3">
                <input type="date" min={data.today || undefined} value={exception.exceptionDate} onChange={(event) => setException({ ...exception, exceptionDate: event.target.value })} className="input" required />
                <select value={exception.availabilityType} onChange={(event) => setException({ ...exception, availabilityType: event.target.value })} className="input">
                  <option value="UNAVAILABLE">Unavailable</option>
                  <option value="AVAILABLE">Available</option>
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input type="time" value={exception.startTime} onChange={(event) => setException({ ...exception, startTime: event.target.value })} className="input" aria-label="Exception start" />
                  <input type="time" value={exception.endTime} onChange={(event) => setException({ ...exception, endTime: event.target.value })} className="input" aria-label="Exception end" />
                </div>
                <textarea rows={3} value={exception.notes} onChange={(event) => setException({ ...exception, notes: event.target.value })} placeholder="Optional note" className="input resize-none" />
              </div>
              <button disabled={saving || !exception.exceptionDate} className="mt-4 w-full rounded-xl border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-4 py-3 text-sm font-black text-[#E7C797] disabled:opacity-40">Add Exception</button>
            </form>

            <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5">
              <h2 className="text-lg font-black">Upcoming Exceptions</h2>
              <div className="mt-4 space-y-2">
                {(data.exceptions || []).filter((row) => row.status === "ACTIVE").length ? (data.exceptions || []).filter((row) => row.status === "ACTIVE").map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-3">
                    <div className="min-w-0 text-xs"><div className="font-black text-white/75">{row.exception_date} · {displayType(row.availability_type)}</div><div className="mt-1 truncate text-white/35">{row.start_time && row.end_time ? `${row.start_time}-${row.end_time}` : "All day"}{row.notes ? ` · ${row.notes}` : ""}</div></div>
                    <button type="button" onClick={() => cancelException(row.id)} className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-300" aria-label="Cancel exception"><Trash2 className="h-4 w-4" /></button>
                  </div>
                )) : <p className="text-xs text-white/30">No upcoming date-specific exceptions.</p>}
              </div>
            </section>
          </div>
        </section>
      </div>

      <style jsx>{`
        .input { width: 100%; border-radius: .75rem; border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.22); padding: .7rem .8rem; color: white; outline: none; }
        .input:focus { border-color: rgba(214,166,106,.45); }
        option { background: #111; }
      `}</style>
    </main>
  );
}
