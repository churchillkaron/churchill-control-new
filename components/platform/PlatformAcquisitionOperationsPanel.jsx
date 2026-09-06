"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const PLATFORM_OWNER_TIME_ZONE = "Asia/Bangkok";
const TERMINAL = new Set(["FIRST_VALUE", "LOST"]);

function clean(value) { return String(value ?? "").trim(); }
function stageLabel(value) { return clean(value).toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Unknown"; }
function observedSnapshot(...values) {
  const times = values.map((value) => new Date(value || 0).getTime()).filter((time) => Number.isFinite(time) && time > 0);
  return times.length ? new Date(Math.min(...times)).toISOString() : "";
}
function ageLabel(value, referenceTime) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time) || !time || !Number.isFinite(referenceTime) || !referenceTime) return "Age unavailable";
  const mins = Math.max(0, Math.floor((referenceTime - time) / 60000));
  if (mins < 60) return `${mins}m in stage`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h in stage`;
  return `${Math.floor(hours / 24)}d in stage`;
}
function dateLabel(value) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time) || !time) return "—";
  return new Intl.DateTimeFormat(undefined, { timeZone: PLATFORM_OWNER_TIME_ZONE, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(time));
}
function blocker(record) {
  if (!record) return "Select an opportunity.";
  if (record.stage === "PROSPECT") return "Qualification identity and evidence are not yet stored.";
  if (record.stage === "QUALIFIED") return "Commercial commitment evidence is not yet verified.";
  if (record.stage === "COMMITMENT_PENDING") return (record.verifiedSubscriptionCandidates || []).length ? "An identity-matched subscription exists; commitment verification is pending." : "No identity-matched subscription exists yet.";
  if (record.stage === "COMMITTED") return record.verifiedCustomerCandidate ? "The subscription resolves to a current customer; customer verification is pending." : "The committed subscription does not resolve to a current customer organization.";
  if (record.stage === "CUSTOMER_CREATED") return "An active human is not yet proven by a current organization-user re-read.";
  if (record.stage === "HUMAN_ACTIVE") return "First successful metered service use is not yet proven.";
  if (record.stage === "FIRST_VALUE") return "Activation achieved with canonical first-value evidence.";
  if (record.stage === "LOST") return "Opportunity is terminal and preserved as acquisition evidence.";
  return "Current gate requires review.";
}
async function json(path, options) {
  const response = await fetch(path, { cache: "no-store", credentials: "same-origin", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) throw new Error(payload?.error || "Request failed");
  return payload;
}

export default function PlatformAcquisitionOperationsPanel() {
  const [pipeline, setPipeline] = useState(null);
  const [obligations, setObligations] = useState([]);
  const [observedAt, setObservedAt] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [completionReference, setCompletionReference] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
      const [pipelineResult, obligationsResult] = await Promise.all([
        json(`/api/platform/admin/commercial-pipeline?organizationId=${scope}`),
        json(`/api/platform/admin/acquisition-obligations?organizationId=${scope}`),
      ]);
      setPipeline(pipelineResult);
      setObligations(Array.isArray(obligationsResult?.obligations) ? obligationsResult.obligations : []);
      setObservedAt(observedSnapshot(pipelineResult?.observedAt, obligationsResult?.observedAt));
      const rows = Array.isArray(pipelineResult?.recentAcquisitions) ? pipelineResult.recentAcquisitions : [];
      setSelectedId((current) => rows.some((row) => row.id === current) ? current : (rows[0]?.id || ""));
      setError("");
    } catch (e) { setError(e?.message || "Acquisition operating evidence is unavailable"); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onFocus = () => load();
    const refresh = window.setInterval(() => load(), 60000);
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(refresh); window.removeEventListener("focus", onFocus); };
  }, [load]);

  const authoritativeNow = useMemo(() => {
    const time = new Date(observedAt || 0).getTime();
    return Number.isFinite(time) && time > 0 ? time : null;
  }, [observedAt]);
  const recent = useMemo(() => Array.isArray(pipeline?.recentAcquisitions) ? pipeline.recentAcquisitions : [], [pipeline]);
  const openByAcquisition = useMemo(() => new Map(obligations.filter((row) => row.status === "OPEN").map((row) => [row.acquisition_id, row])), [obligations]);
  const ranked = useMemo(() => [...recent].sort((a, b) => {
    const oa = openByAcquisition.get(a.id); const ob = openByAcquisition.get(b.id);
    const dueA = oa ? new Date(oa.due_at).getTime() : null; const dueB = ob ? new Date(ob.due_at).getTime() : null;
    const overdueA = oa && authoritativeNow !== null && Number.isFinite(dueA) && dueA <= authoritativeNow;
    const overdueB = ob && authoritativeNow !== null && Number.isFinite(dueB) && dueB <= authoritativeNow;
    const ra = overdueA ? 0 : oa ? 1 : TERMINAL.has(a.stage) ? 3 : 2;
    const rb = overdueB ? 0 : ob ? 1 : TERMINAL.has(b.stage) ? 3 : 2;
    if (ra !== rb) return ra - rb;
    if (oa && ob) return dueA - dueB;
    return new Date(a.stage_updated_at || a.updated_at || 0) - new Date(b.stage_updated_at || b.updated_at || 0);
  }), [recent, openByAcquisition, authoritativeNow]);
  const selected = recent.find((row) => row.id === selectedId) || null;
  const open = selected ? openByAcquisition.get(selected.id) || null : null;
  const history = selected ? obligations.filter((row) => row.acquisition_id === selected.id) : [];
  const active = recent.filter((row) => !TERMINAL.has(row.stage));
  const overdue = authoritativeNow === null ? 0 : obligations.filter((row) => row.status === "OPEN" && new Date(row.due_at).getTime() <= authoritativeNow).length;
  const unscheduled = active.filter((row) => !openByAcquisition.has(row.id)).length;
  const activation = recent.filter((row) => ["COMMITTED", "CUSTOMER_CREATED", "HUMAN_ACTIVE"].includes(row.stage)).length;

  useEffect(() => {
    setTitle(selected?.nextAction || ""); setDueAt(""); setScheduleNote(""); setRescheduleReason(""); setCompletionReference(""); setCompletionNote("");
  }, [selectedId, selected?.stage, selected?.nextAction]);

  const saveObligation = async () => {
    if (!selected || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
      await json(`/api/platform/admin/acquisition-obligations?organizationId=${scope}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acquisitionId: selected.id, expectedStage: selected.stage, title, dueAt, scheduleNote, rescheduleReason }),
      });
      setNotice(open ? "Owner obligation rescheduled with preserved reason." : "Owner obligation scheduled.");
      await load();
    } catch (e) { setError(e?.message || "Unable to schedule owner obligation"); } finally { setSaving(false); }
  };
  const completeObligation = async () => {
    if (!open || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
      await json(`/api/platform/admin/acquisition-obligations?organizationId=${scope}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obligationId: open.id, evidenceReference: completionReference, note: completionNote }),
      });
      setNotice("Owner obligation completed with evidence."); await load();
    } catch (e) { setError(e?.message || "Unable to complete owner obligation"); } finally { setSaving(false); }
  };

  return (
    <section className="bg-[#F4F3EF] px-4 pb-6 md:px-5" data-avantiqo-acquisition-operations="true">
      <div className="mx-auto max-w-[1680px] overflow-hidden rounded-[22px] border border-black/[0.07] bg-white">
        <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] px-4 py-4">
          <div><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8D877E]">Owner operating control</div><h2 className="mt-1.5 text-[17px] font-semibold tracking-[-0.025em] text-[#403C37]">Every live opportunity has one explicit next obligation.</h2><p className="mt-1 max-w-3xl text-[9px] leading-4 text-[#918B83]">Stage age and overdue priority use the server observation clock. Owner due times are Bangkok (UTC+7). {observedAt ? `Observed ${dateLabel(observedAt)}.` : "Server clock unavailable; overdue state is fail-closed."}</p></div>
          <button onClick={load} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] px-2.5 text-[8px] text-[#625D55]"><RefreshCw size={10}/>Refresh</button>
        </div>
        {error ? <div className="flex gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-[9px] text-amber-900"><TriangleAlert size={12}/>{error}</div> : null}
        {notice ? <div className="flex gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-[9px] text-emerald-900"><CheckCircle2 size={12}/>{notice}</div> : null}
        <div className="grid grid-cols-2 gap-px bg-black/[0.06] lg:grid-cols-4">
          {[["Active opportunities",active.length],["Overdue obligations",overdue],["Unscheduled active",unscheduled],["Post-commit activation",activation]].map(([label,value]) => <div key={label} className="bg-white px-4 py-4"><div className="text-[8px] uppercase tracking-[0.12em] text-[#98928A]">{label}</div><div className="mt-2 text-[16px] font-semibold text-[#3D3934]">{value}</div></div>)}
        </div>
        <div className="grid lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="border-b border-black/[0.06] lg:border-b-0 lg:border-r">
            {ranked.length ? ranked.map((row) => { const obligation = openByAcquisition.get(row.id); const due = obligation ? new Date(obligation.due_at).getTime() : null; const isOverdue = Boolean(obligation && authoritativeNow !== null && Number.isFinite(due) && due <= authoritativeNow); return <button key={row.id} onClick={() => setSelectedId(row.id)} className={`block w-full border-b border-black/[0.055] px-4 py-3 text-left ${selectedId === row.id ? "bg-[#FBF7F1]" : "bg-white hover:bg-[#FBFAF8]"}`}><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-semibold text-[#48423C]">{row.prospect_company || row.prospect_contact || row.source || row.id.slice(0,8)}</span><span className="text-[7px] uppercase text-[#8A643C]">{stageLabel(row.stage)}</span></div><div className="mt-1 flex items-center justify-between gap-2 text-[8px] text-[#918B83]"><span>{ageLabel(row.stage_updated_at || row.updated_at, authoritativeNow)}</span><span className={isOverdue ? "font-semibold text-red-700" : ""}>{obligation ? `${isOverdue ? "Overdue" : "Due"} ${dateLabel(obligation.due_at)}` : TERMINAL.has(row.stage) ? "Terminal" : "No follow-up"}</span></div></button>; }) : <div className="p-4 text-[9px] text-[#918B83]">No canonical acquisition records yet.</div>}
          </div>
          <div className="p-4">
            {selected ? <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3"><div className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-3"><div className="text-[7px] uppercase text-[#99938B]">Stage</div><div className="mt-1 text-[10px] font-semibold text-[#48423C]">{stageLabel(selected.stage)}</div></div><div className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-3"><div className="text-[7px] uppercase text-[#99938B]">Stage age</div><div className="mt-1 text-[10px] font-semibold text-[#48423C]">{ageLabel(selected.stage_updated_at || selected.updated_at, authoritativeNow)}</div></div><div className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-3"><div className="text-[7px] uppercase text-[#99938B]">Next gate</div><div className="mt-1 text-[9px] leading-4 text-[#48423C]">{selected.nextAction || "No next stage action"}</div></div></div>
              <div className="rounded-xl border border-[#B98A57]/20 bg-[#FBF7F1] p-3"><div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#8A643C]"><ShieldAlert size={11}/>Activation blocker</div><div className="mt-1 text-[9px] leading-4 text-[#66594C]">{blocker(selected)}</div></div>
              {!TERMINAL.has(selected.stage) ? <div className="rounded-xl border border-black/[0.06] p-3"><div className="text-[9px] font-semibold text-[#48423C]">{open ? "Reschedule next owner obligation" : "Schedule next owner obligation"}</div>{open ? <div className="mt-1 text-[8px] text-[#918B83]">Current: {open.title} · due {dateLabel(open.due_at)}</div> : null}<div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Next owner action" className="h-9 rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-2.5 text-[9px]"/><input type="datetime-local" value={dueAt} onChange={(e)=>setDueAt(e.target.value)} className="h-9 rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-2.5 text-[9px]"/><textarea value={scheduleNote} onChange={(e)=>setScheduleNote(e.target.value)} placeholder="Why this follow-up is required" className="min-h-16 rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-2.5 py-2 text-[9px]"/>{open ? <textarea value={rescheduleReason} onChange={(e)=>setRescheduleReason(e.target.value)} placeholder="Why the existing obligation is being rescheduled" className="min-h-16 rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-2.5 py-2 text-[9px]"/> : <div/>}</div><button disabled={saving || !clean(title) || !clean(dueAt) || !clean(scheduleNote) || (open && !clean(rescheduleReason))} onClick={saveObligation} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-3 text-[9px] font-semibold text-[#8A643C] disabled:opacity-40"><Clock3 size={11}/>{open ? "Reschedule obligation" : "Schedule obligation"}</button></div> : null}
              {open ? <div className="rounded-xl border border-black/[0.06] p-3"><div className="text-[9px] font-semibold text-[#48423C]">Complete current obligation with evidence</div><div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={completionReference} onChange={(e)=>setCompletionReference(e.target.value)} placeholder="Evidence reference" className="h-9 rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-2.5 text-[9px]"/><textarea value={completionNote} onChange={(e)=>setCompletionNote(e.target.value)} placeholder="Observed result" className="min-h-16 rounded-lg border border-black/[0.08] bg-[#FBFAF8] px-2.5 py-2 text-[9px]"/></div><button disabled={saving || !clean(completionReference) || !clean(completionNote)} onClick={completeObligation} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 text-[9px] font-semibold text-[#625D55] disabled:opacity-40"><CheckCircle2 size={11}/>Complete with evidence</button></div> : null}
              <div className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-3"><div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#8D877E]">Obligation history</div><div className="mt-2 space-y-2">{history.length ? history.map((row)=>{ const due = new Date(row.due_at).getTime(); const isOverdue = row.status === "OPEN" && authoritativeNow !== null && Number.isFinite(due) && due <= authoritativeNow; return <div key={row.id} className="border-t border-black/[0.05] pt-2 first:border-0 first:pt-0"><div className="flex justify-between gap-3 text-[8px]"><span className="font-semibold text-[#514B44]">{row.title}</span><span className={isOverdue ? "text-red-700" : "text-[#918B83]"}>{row.status} · {dateLabel(row.due_at)}</span></div><div className="mt-0.5 text-[8px] leading-4 text-[#918B83]">{row.schedule_note}</div>{row.completion_evidence_reference ? <div className="text-[8px] text-[#777168]">Evidence: {row.completion_evidence_reference}</div> : null}{row.completion_note ? <div className="text-[8px] text-[#777168]">{row.completion_note}</div> : null}</div>;}) : <div className="text-[8px] text-[#918B83]">No owner-obligation history yet.</div>}</div></div>
            </div> : <div className="text-[9px] text-[#918B83]">Select a canonical opportunity to operate it.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}