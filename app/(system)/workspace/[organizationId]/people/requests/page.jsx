"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck2, RefreshCw, Repeat2 } from "lucide-react";

function label(value) {
  return String(value || "-").replaceAll("_", " ");
}

export default function WorkforceRequestsManagementPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/people/workforce/requests?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error || "Unable to load workforce requests");
      setData(result);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load workforce requests");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  async function review(kind, requestId, decision) {
    const notes = window.prompt("Manager note (optional)", "") || "";
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/people/workforce/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, kind, requestId, decision, notes }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error || "Review failed");
      setMessage(decision === "APPROVE" ? "Request approved." : "Request rejected.");
      await load();
    } catch (reviewError) {
      setError(reviewError?.message || "Review failed");
    } finally {
      setWorking(false);
    }
  }

  const staffById = useMemo(
    () => new Map((data?.staff || []).map((row) => [row.id, row])),
    [data]
  );
  const pendingLeave = (data?.timeOffRequests || []).filter((row) => row.status === "PENDING");
  const pendingSwaps = (data?.swapRequests || []).filter((row) => row.status === "PENDING_MANAGER");
  const history = [
    ...(data?.timeOffRequests || []).map((row) => ({ ...row, kind: "Time off" })),
    ...(data?.swapRequests || []).map((row) => ({ ...row, kind: "Shift swap" })),
  ].sort((a, b) => String(b.requested_at || "").localeCompare(String(a.requested_at || "")));

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-5 text-[#191919] lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[30px] border border-black/[0.08] bg-[#FBF8F3] p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-[#D6A66A]">People · Workforce</div>
              <h1 className="mt-2 text-3xl font-black">Time Off & Shift Swaps</h1>
              <p className="mt-2 max-w-3xl text-sm text-[#746E66]">Approve employee leave and future evidence-free roster transfers. Approved time off becomes Payroll attendance evidence automatically.</p>
            </div>
            <button onClick={load} disabled={loading} className="flex h-11 items-center gap-2 rounded-xl border border-black/[0.08] px-4 text-xs font-black uppercase tracking-[0.15em] text-[#5F5A54]"><RefreshCw className="h-4 w-4" /> Refresh</button>
          </div>
        </section>

        {error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">{message}</div> : null}

        <section className="grid gap-5 lg:grid-cols-2">
          <Queue title="Pending time off" icon={<CalendarCheck2 className="h-4 w-4" />} empty="No pending time-off requests.">
            {pendingLeave.map((row) => {
              const staff = staffById.get(row.staff_id);
              return <RequestCard key={row.id} title={staff?.name || staff?.email || "Staff"} meta={`${row.leave_type} · ${row.start_date}${row.end_date !== row.start_date ? ` → ${row.end_date}` : ""}`} reason={row.reason}>
                <div className="mt-2 text-xs text-[#918B83]">Payroll classification: {label(row.attendance_classification)}</div>
                <Actions working={working} approve={() => review("time_off", row.id, "APPROVE")} reject={() => review("time_off", row.id, "REJECT")} />
              </RequestCard>;
            })}
          </Queue>

          <Queue title="Pending shift swaps" icon={<Repeat2 className="h-4 w-4" />} empty="No swaps waiting for manager approval.">
            {pendingSwaps.map((row) => {
              const requester = staffById.get(row.requester_staff_id);
              const target = staffById.get(row.target_staff_id);
              return <RequestCard key={row.id} title={`${requester?.name || requester?.email || "Staff"} → ${target?.name || target?.email || "Staff"}`} meta={`${row.shift_date} · ${row.start_time}–${row.end_time}`} reason={row.reason}>
                <div className="mt-2 text-xs text-emerald-200/60">Coworker accepted · manager approval will transfer the published roster row atomically.</div>
                <Actions working={working} approve={() => review("shift_swap", row.id, "APPROVE")} reject={() => review("shift_swap", row.id, "REJECT")} />
              </RequestCard>;
            })}
          </Queue>
        </section>

        <section className="rounded-[28px] border border-black/[0.08] bg-[#FBF8F3] p-5">
          <h2 className="text-lg font-black">Request history</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {history.length ? history.slice(0, 40).map((row) => {
              const staff = staffById.get(row.staff_id || row.requester_staff_id);
              return <div key={`${row.kind}-${row.id}`} className="rounded-2xl border border-black/[0.07] bg-[#F7F6F3]/20 p-4">
                <div className="flex items-start justify-between gap-4"><div className="font-black">{row.kind} · {staff?.name || staff?.email || "Staff"}</div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#D6A66A]">{label(row.status)}</div></div>
                <div className="mt-2 text-sm text-[#817A72]">{row.kind === "Time off" ? `${row.start_date} → ${row.end_date} · ${row.leave_type}` : `${row.shift_date} · ${row.start_time}–${row.end_time}`}</div>
                {row.review_notes ? <div className="mt-2 text-xs text-[#A19A92]">Manager: {row.review_notes}</div> : null}
              </div>;
            }) : <div className="text-sm text-[#918B83]">No request history yet.</div>}
          </div>
        </section>
      </div>
    </main>
  );
}

function Queue({ title, icon, empty, children }) {
  const items = Array.isArray(children) ? children : [children].filter(Boolean);
  return <article className="rounded-[28px] border border-black/[0.08] bg-[#FBF8F3] p-5"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#D6A66A]">{icon}{title}</div><div className="mt-4 space-y-3">{items.length ? items : <div className="text-sm text-[#918B83]">{empty}</div>}</div></article>;
}

function RequestCard({ title, meta, reason, children }) {
  return <div className="rounded-2xl border border-black/[0.08] bg-[#F7F6F3]/20 p-4"><div className="font-black">{title}</div><div className="mt-1 text-sm text-[#746E66]">{meta}</div><div className="mt-2 text-sm text-[#918B83]">{reason}</div>{children}</div>;
}

function Actions({ working, approve, reject }) {
  return <div className="mt-4 flex gap-2"><button disabled={working} onClick={approve} className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-40">Approve</button><button disabled={working} onClick={reject} className="rounded-xl border border-black/[0.08] px-4 py-2 text-xs font-black uppercase text-[#5F5A54] disabled:opacity-40">Reject</button></div>;
}
