"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, RefreshCw, Repeat2 } from "lucide-react";

const inputClass = "h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#D6A66A]/60";

function badge(status) {
  const normalized = String(status || "").replaceAll("_", " ");
  return normalized || "-";
}

export default function StaffWorkforceRequestsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [timeOff, setTimeOff] = useState({
    leaveType: "Annual leave",
    attendanceClassification: "APPROVED_LEAVE",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const [swap, setSwap] = useState({
    scheduleId: "",
    targetStaffId: "",
    reason: "",
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/staff/workforce-requests", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error || "Unable to load requests");
      setData(result);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function act(payload, successMessage) {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/staff/workforce-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error || "Request failed");
      setMessage(successMessage);
      await load();
    } catch (actionError) {
      setError(actionError?.message || "Request failed");
    } finally {
      setWorking(false);
    }
  }

  const staffById = useMemo(
    () => new Map((data?.coworkers || []).map((row) => [row.id, row])),
    [data]
  );
  const schedules = data?.upcomingSchedules || [];
  const swaps = data?.swapRequests || [];
  const incoming = (data?.incomingSwapRequests || []).filter((row) => row.status === "PENDING_TARGET");
  const timeOffRequests = data?.timeOffRequests || [];

  return (
    <main className="min-h-screen bg-[#030303] p-5 text-white lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link href="/staff" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/40"><ArrowLeft className="h-4 w-4" /> Staff portal</Link>
              <h1 className="mt-3 text-3xl font-black">Time Off & Shift Swaps</h1>
              <p className="mt-2 text-sm text-white/45">Request leave, offer a future shift to a coworker, and follow manager approval.</p>
            </div>
            <button onClick={load} disabled={loading} className="flex h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-black uppercase tracking-[0.15em] text-white/65"><RefreshCw className="h-4 w-4" /> Refresh</button>
          </div>
        </section>

        {error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">{message}</div> : null}

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#D6A66A]"><CalendarDays className="h-4 w-4" /> Request time off</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input className={inputClass} value={timeOff.leaveType} onChange={(e) => setTimeOff((v) => ({ ...v, leaveType: e.target.value }))} placeholder="Leave type" />
              <select className={inputClass} value={timeOff.attendanceClassification} onChange={(e) => setTimeOff((v) => ({ ...v, attendanceClassification: e.target.value }))}>
                <option value="APPROVED_LEAVE">Leave</option>
                <option value="SICK_LEAVE">Sick leave</option>
              </select>
              <input className={inputClass} type="date" value={timeOff.startDate} onChange={(e) => setTimeOff((v) => ({ ...v, startDate: e.target.value }))} />
              <input className={inputClass} type="date" value={timeOff.endDate} onChange={(e) => setTimeOff((v) => ({ ...v, endDate: e.target.value }))} />
            </div>
            <textarea className="mt-3 min-h-24 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none" value={timeOff.reason} onChange={(e) => setTimeOff((v) => ({ ...v, reason: e.target.value }))} placeholder="Reason" />
            <button disabled={working || !timeOff.startDate || !timeOff.endDate || timeOff.reason.trim().length < 3} onClick={() => act({ action: "request_time_off", ...timeOff }, "Time-off request submitted.")} className="mt-3 h-11 w-full rounded-xl bg-[#D6A66A] text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40">Submit time off</button>
          </article>

          <article className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#D6A66A]"><Repeat2 className="h-4 w-4" /> Request shift swap</div>
            <div className="mt-4 grid gap-3">
              <select className={inputClass} value={swap.scheduleId} onChange={(e) => setSwap((v) => ({ ...v, scheduleId: e.target.value }))}>
                <option value="">Choose future shift</option>
                {schedules.filter((row) => !row.swapOpen).map((row) => <option key={row.id} value={row.id}>{row.shift_date} · {row.start_time}–{row.end_time}</option>)}
              </select>
              <select className={inputClass} value={swap.targetStaffId} onChange={(e) => setSwap((v) => ({ ...v, targetStaffId: e.target.value }))}>
                <option value="">Choose coworker</option>
                {(data?.coworkers || []).map((row) => <option key={row.id} value={row.id}>{row.name || row.email} · {row.department || row.position || row.role || "Staff"}</option>)}
              </select>
              <textarea className="min-h-24 rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none" value={swap.reason} onChange={(e) => setSwap((v) => ({ ...v, reason: e.target.value }))} placeholder="Why do you need the swap?" />
            </div>
            <button disabled={working || !swap.scheduleId || !swap.targetStaffId || swap.reason.trim().length < 3} onClick={() => act({ action: "request_shift_swap", ...swap }, "Shift-swap request sent to coworker.")} className="mt-3 h-11 w-full rounded-xl bg-[#D6A66A] text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40">Send swap request</button>
          </article>
        </section>

        {incoming.length ? <section className="rounded-[28px] border border-amber-300/20 bg-amber-300/[0.06] p-5">
          <h2 className="text-lg font-black">Swap requests waiting for you</h2>
          <div className="mt-4 grid gap-3">
            {incoming.map((row) => <div key={row.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="font-black">{row.shift_date} · {row.start_time}–{row.end_time}</div>
              <div className="mt-1 text-sm text-white/45">{row.reason}</div>
              <div className="mt-3 flex gap-2">
                <button disabled={working} onClick={() => act({ action: "respond_shift_swap", requestId: row.id, decision: "ACCEPT" }, "Swap accepted and sent for manager approval.")} className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-black text-black">Accept</button>
                <button disabled={working} onClick={() => act({ action: "respond_shift_swap", requestId: row.id, decision: "DECLINE" }, "Swap declined.")} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-black text-white/70">Decline</button>
              </div>
            </div>)}
          </div>
        </section> : null}

        <section className="grid gap-5 lg:grid-cols-2">
          <History title="Time-off history" rows={timeOffRequests} render={(row) => <>
            <div className="font-black">{row.leave_type} · {row.start_date}{row.end_date !== row.start_date ? ` → ${row.end_date}` : ""}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.12em] text-[#D6A66A]">{badge(row.status)}</div>
            <div className="mt-2 text-sm text-white/40">{row.reason}</div>
            {row.status === "PENDING" ? <button disabled={working} onClick={() => act({ action: "cancel_time_off", requestId: row.id }, "Time-off request cancelled.")} className="mt-3 text-xs font-black uppercase text-red-200/70">Cancel</button> : null}
          </>} />
          <History title="Shift-swap history" rows={swaps} render={(row) => <>
            <div className="font-black">{row.shift_date} · {row.start_time}–{row.end_time}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.12em] text-[#D6A66A]">{badge(row.status)} · {staffById.get(row.target_staff_id)?.name || "Coworker"}</div>
            <div className="mt-2 text-sm text-white/40">{row.reason}</div>
            {["PENDING_TARGET", "PENDING_MANAGER"].includes(row.status) ? <button disabled={working} onClick={() => act({ action: "cancel_shift_swap", requestId: row.id }, "Shift-swap request cancelled.")} className="mt-3 text-xs font-black uppercase text-red-200/70">Cancel</button> : null}
          </>} />
        </section>
      </div>
    </main>
  );
}

function History({ title, rows, render }) {
  return <article className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
    <h2 className="text-lg font-black">{title}</h2>
    <div className="mt-4 space-y-3">
      {rows.length ? rows.slice(0, 25).map((row) => <div key={row.id} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">{render(row)}</div>) : <div className="text-sm text-white/35">No requests yet.</div>}
    </div>
  </article>;
}
